````md
# KYC SDK Documentation

## Table of Contents

- [Overview](#overview)
- [Installation (Website)](#installation-website)
  - [1. Install the SDK Package](#1-install-the-sdk-package)
  - [2. Import and Initialize](#2-import-and-initialize)
  - [3. Using the SDK](#3-using-the-sdk)
- [Installation via CDN (Website)](#installation-via-cdn-website)
- [Ionic Integration](#ionic-integration)
  - [1. Install Dependencies](#1-install-dependencies)
  - [2. iOS Permission Configuration](#2-ios-permission-configuration)
  - [3. Android Permission Configuration](#3-android-permission-configuration)
  - [4. Handling Permission Requests in Ionic](#4-handling-permission-requests-in-ionic)
- [Methods](#methods)
- [Error Handling](#error-handling)
- [Conclusion](#conclusion)

## Overview

This guide explains how to integrate and use the KYC SDK for both websites and Ionic mobile applications. The SDK allows you to manage user KYC (Know Your Customer) processes, including updating user information and authenticating users.

## Installation (Website)

### 1. Install the SDK Package

Use the following npm command to install the package in your web project:

```sh
npm install kyc_package
```
````

### 2. Import and Initialize

Import the SDK into your JavaScript or TypeScript file:

```js
import AcidCheck from "kyc_package";
```

Then, initialize it with the following syntax:

```js
const kycSDK = new AcidCheck(Acid, email, url);
```

Replace the parameters as follows:

- **Acid:** A unique identifier for the user (derived from the organization ID and the account number of the user).
- **email:** The user's email address.
- **url (optional):** The custom URL for the KYC service (if applicable).

**Example:**

```js
const kycSDK = new AcidCheck("USER_ID_123", "user@example.com");
```

### 3. Using the SDK

- **Update KYC Information:**

  ```js
  kycSDK.initializeUpdate();
  ```

- **Authenticate User:**

  ```js
  kycSDK.initialize();
  ```

## Installation via CDN (Website)

For web projects where you prefer to use a CDN, include the SDK directly in your HTML file:

```html
<script src="https://cdn.example.com/kyc_package.min.js"></script>
```

After including the script, you can initialize and use the SDK as shown in the Installation (Website) section.

## Ionic Integration

When using the KYC SDK in an Ionic mobile app, additional setup is required to handle camera and location permissions.

### 1. Install Dependencies

For location and camera access in an Ionic app, install the necessary Capacitor plugins.

- **Location Access:**

  ```sh
  npm install @capacitor/geolocation
  npx cap sync
  ```

- **Camera Access:**

  ```sh
  npm install @capacitor/camera
  npx cap sync
  ```

### 2. iOS Permission Configuration

Add the following entries to your `info.plist` file:

```xml
<!-- Location Permissions -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>We need your location to verify your identity.</string>

<!-- Camera Permissions -->
<key>NSCameraUsageDescription</key>
<string>We need access to your camera for KYC verification.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>We need access to add photos to your library.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>We need access to your photo library for KYC verification.</string>
```

### 3. Android Permission Configuration

In your `AndroidManifest.xml`, add the following permissions:

- **Location Permissions:**

  ```xml
  <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-feature android:name="android.hardware.location.gps" />
  ```

- **Camera and Storage Permissions:**

  ```xml
  <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
  <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
  ```

Additionally, add the following service for photo picker functionality:

```xml
<service android:name="com.google.android.gms.metadata.ModuleDependencies"
         android:enabled="false"
         android:exported="false"
         tools:ignore="MissingClass">
  <intent-filter>
    <action android:name="com.google.android.gms.metadata.MODULE_DEPENDENCIES" />
  </intent-filter>
  <meta-data android:name="photopicker_activity:0:required" android:value="" />
</service>
```

### 4. Handling Permission Requests in Ionic

Before calling the KYC SDK methods in an Ionic app, ensure that both camera and location permissions are granted. Here's an example of how to check and request these permissions:

```js
import { Camera } from "@capacitor/camera";
import { Geolocation } from "@capacitor/geolocation";
import { isPlatform } from "@ionic/react";
import { presentAlert } from "@ionic/react";

const initializeUpdate = async () => {
  if (!isPlatform("capacitor")) {
    kycSDK.initializeUpdate();
    return;
  }

  const cam = await Camera.requestPermissions();
  const geo = await Geolocation.requestPermissions();

  if (cam.camera !== "granted") {
    presentAlert({
      header: "Error",
      message: "Camera permission is required",
      buttons: ["OK"],
    });
    return;
  }

  if (geo.location !== "granted") {
    presentAlert({
      header: "Error",
      message: "Location permission is required",
      buttons: ["OK"],
    });
    return;
  }

  if (cam.camera === "granted" && geo.location === "granted") {
    kycSDK.initializeUpdate();
  }
};
```

## Methods

Once the KYC SDK is initialized, you can use the following methods:

- **Update KYC Information:**

  ```js
  kycSDK.initializeUpdate();
  ```

- **Authenticate User:**

  ```js
  kycSDK.initialize();
  ```

## Error Handling

During the KYC update or authentication process, the SDK may encounter errors due to invalid user data or connection issues. Ensure that you handle these errors appropriately in your implementation.

**Example Error Handling:**

```js
kycSDK.initialize().catch((error) => {
  console.error("KYC authentication failed:", error);
});
```

Implement similar error handling for `kycSDK.initializeUpdate()` as needed.

## Conclusion

By following this guide, you can successfully integrate and use the KYC SDK for both websites and Ionic mobile applications. Make sure that all necessary permissions are granted in your Ionic app to avoid issues with camera and location access.

```

```
