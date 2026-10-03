package uk.co.aibeatstudio.pads

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/**
 * AI Beat Pads: the phone controller for AI Beat Studio.
 * A start screen (assets/start.html) picks the studio: scan its QR code (Wi-Fi) or USB
 * (the studio maps this phone's localhost:7777 to the laptop with `adb reverse`).
 * The pads themselves are served by the studio, so they always match the desktop version.
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private val prefs by lazy { getSharedPreferences("pads", MODE_PRIVATE) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this).apply {
            setBackgroundColor(0xFF0E0D14.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            addJavascriptInterface(Bridge(), "Pads")
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) showStart("Couldn't reach the studio at ${request.url.host}:${request.url.port}. Is the AI Beat Studio app open?")
                }
            }
        }
        setContentView(web)
        showStart(null)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.url?.startsWith("file:") == true) finish() else showStart(null)
            }
        })
    }

    private fun showStart(error: String?) {
        val q = if (error != null) "?error=" + Uri.encode(error) else ""
        web.loadUrl("file:///android_asset/start.html$q")
    }

    private fun openStudio(raw: String) {
        var url = raw.trim()
        if (url.isEmpty()) return
        if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://$url"
        if (Uri.parse(url).port == -1) url = url.trimEnd('/') + ":7777"
        prefs.edit().putString("last", url).apply()
        web.loadUrl(url)
    }

    /** Called from start.html. JS runs on a background thread, so hop to the UI thread. */
    inner class Bridge {
        @JavascriptInterface fun lastUrl(): String = prefs.getString("last", "") ?: ""
        @JavascriptInterface fun open(url: String) = runOnUiThread { openStudio(url) }
        @JavascriptInterface fun usb() = runOnUiThread { openStudio("http://localhost:7777") }
        @JavascriptInterface fun scan() = runOnUiThread {
            val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
            GmsBarcodeScanning.getClient(this@MainActivity, options).startScan()
                .addOnSuccessListener { code -> code.rawValue?.let { openStudio(it) } }
                .addOnFailureListener { showStart("The QR scanner isn't available. Type the address instead.") }
        }
    }
}
