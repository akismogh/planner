package com.akismogh.retirementplanner

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Thin WebView shell that hosts the Retirement Planner React app bundled into
 * app/src/main/assets (produced by `npm run build:gh`). Everything — the
 * calculations, charts, i18n and localStorage persistence — runs inside the
 * WebView exactly as it does in the browser. No server, works offline.
 *
 * Assets are served through WebViewAssetLoader over the virtual origin
 * https://appassets.androidplatform.net so that ES-module <script> tags and the
 * stylesheet load under a real https origin. Loading them from file:// fails
 * because module scripts are subject to CORS and the file:// origin is "null".
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Draw edge-to-edge so the web app's CSS safe-area insets take effect
        // and the sky gradient can flow under the status bar.
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
            allowFileAccess = false             // not needed; assets go via loader
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView, request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView?, request: WebResourceRequest?
            ): Boolean {
                // Keep in-app (appassets) navigation inside the WebView; punt
                // any real external URL to the system browser.
                val url = request?.url?.toString() ?: return false
                return !url.startsWith("https://appassets.androidplatform.net")
            }
        }
        webView.webChromeClient = WebChromeClient()

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }
}
