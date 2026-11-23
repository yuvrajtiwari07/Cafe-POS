package com.cornercafe.pos

import android.app.Application
import android.webkit.WebView

class CafeApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Enable WebView debugging in debug mode
        WebView.setWebContentsDebuggingEnabled(true)
    }
}
