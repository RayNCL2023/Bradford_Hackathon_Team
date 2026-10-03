plugins {
    id("com.android.application")
}

android {
    namespace = "uk.co.aibeatstudio.pads"
    compileSdk = 37

    defaultConfig {
        applicationId = "uk.co.aibeatstudio.pads"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Hackathon build: signed with the local debug key so it installs on any test phone.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.activity:activity:1.11.0")
    // Google's ready-made QR scanner (runs inside Play services, no camera code or permission needed).
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
}
