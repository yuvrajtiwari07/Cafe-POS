# Corner Cafe POS & Billing — Android App

This directory contains the native Android application for Corner Cafe POS & Billing.

## Features
- **Shared Codebase & Real-Time Sync**: Runs the exact same application UI, logic, and features as the Web POS.
- **Unified Supabase Database**: All cafes, tables, menu items, bills, and stock deductions synchronize in real time across Android and Web devices.
- **Auto-Update**: Because the Android app loads the web client with local caching, any update pushed to the web app automatically reflects inside the Android app without requiring users to reinstall an APK!
- **AI Menu Scanning**: Seamless camera and photo gallery access for scanning and digitizing paper menus.
- **Thermal Printing Support**: Integrated Web Bluetooth permissions for portable 58mm and 80mm wireless thermal receipt printers.
- **Pull-to-Refresh**: Swipe down from top at any time to instantly pull the newest updates.

## Building the APK
1. Open Android Studio.
2. Select **Open an existing project** and choose the `android` folder.
3. Click **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
4. The generated APK will be in `app/build/outputs/apk/release/app-release.apk`.
