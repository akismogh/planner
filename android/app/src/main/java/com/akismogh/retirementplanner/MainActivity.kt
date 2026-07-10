package com.akismogh.retirementplanner

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader
import java.io.File

/**
 * WebView shell hosting the Retirement Planner React app (bundled into
 * app/src/main/assets by `npm run build:gh`). Served through WebViewAssetLoader
 * over https://appassets.androidplatform.net so ES-module scripts + localStorage
 * work under a real https origin.
 *
 * Adds the native plumbing a bare WebView lacks:
 *   • Import  → onShowFileChooser launches the system file picker so the web
 *     app's <input type="file"> actually opens.
 *   • Export  → a DownloadListener reads the blob: URL the web app creates,
 *     hands the bytes to Kotlin via a JS bridge, and writes them to Downloads.
 *   • One-time seed of a bundled res/raw/seed_data.json into localStorage on
 *     first run (no-ops if the resource isn't present or data already exists).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    // ── Import: file chooser callback + launcher ─────────────────────────────
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        filePathCallback?.onReceiveValue(uris)
        filePathCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#AFCFE0"))
        }
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true            // localStorage / sessionStorage
            loadWithOverviewMode = true
            useWideViewPort = true
            allowFileAccess = false
        }

        // Export bridge: the web app calls RetirementAndroid.saveFile(name, json)
        // directly (blob/<a download> downloads don't reliably fire in a WebView).
        webView.addJavascriptInterface(WebBridge(), "RetirementAndroid")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView, request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView?, request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                return !url.startsWith("https://appassets.androidplatform.net")
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                maybeSeedData()
            }
        }

        // Import: implement the file chooser so <input type="file"> works.
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                val intent = params?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "application/json"
                }
                return try {
                    fileChooserLauncher.launch(intent)
                    true
                } catch (e: Exception) {
                    filePathCallback = null
                    false
                }
            }
        }

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    // ── One-time data seed ───────────────────────────────────────────────────
    // Looked up by name so the app still compiles/runs when the (gitignored,
    // private) seed file isn't present in the tree.
    private fun maybeSeedData() {
        val resId = resources.getIdentifier("seed_data", "raw", packageName)
        if (resId == 0) return
        val json = try {
            resources.openRawResource(resId).bufferedReader().use { it.readText() }
        } catch (e: Exception) { return }
        val b64 = Base64.encodeToString(json.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
        val js = """
            (function(){try{
              if(!localStorage.getItem('retirementPlanner.data') &&
                 !localStorage.getItem('retirementPlanner.seeded')){
                var j = decodeURIComponent(escape(atob('$b64')));
                localStorage.setItem('retirementPlanner.data', j);
                localStorage.setItem('retirementPlanner.seeded','1');
                location.reload();
              }
            }catch(e){console.error(e);}})();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    // ── Export bridge ────────────────────────────────────────────────────────
    inner class WebBridge {
        @JavascriptInterface
        fun saveFile(filename: String, content: String) {
            runOnUiThread {
                saveToDownloads(content.toByteArray(Charsets.UTF_8), filename, "application/json")
            }
        }
    }

    private fun saveToDownloads(bytes: ByteArray, filename: String, mime: String) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, filename)
                    put(MediaStore.Downloads.MIME_TYPE, mime)
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val resolver = contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                if (uri == null) { toast("Export failed"); return }
                resolver.openOutputStream(uri)?.use { it.write(bytes) }
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } else {
                val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                File(dir, filename).writeBytes(bytes)
            }
            toast("Saved to Downloads: $filename")
        } catch (e: Exception) {
            toast("Export failed: ${e.message}")
        }
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
}
