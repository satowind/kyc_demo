(function (global) {
  let mouseData = [];
  let touchData = [];
  let injectedScripts = [];
  let injectedLinks = [];
  let events = [];

  const script = document.createElement("script");
  script.src =
    "https://cdn.jsdelivr.net/npm/rrweb@2.0.0-alpha.4/dist/record/rrweb-record.min.js";
  script.onload = function () {
    // Initialize recording
    rrwebRecord({
      emit(event) {
        events.push(event);
      },
      inlineImages: true,
      collectFonts: true,
      sampling: {
        mousemove: true,
        scroll: 150, // do not emit twice in 150ms
        media: 800,
        mouseInteraction: {
          MouseUp: false,
          MouseDown: true,
          Click: true,
          ContextMenu: true,
          Focus: false,
          Blur: false,
          TouchStart: true,
          TouchEnd: false,
        },
      },
    });
  };
  document.head.appendChild(script);

  function handleMouseMove(event) {
    mouseData.push({
      x: event.clientX,
      y: event.clientY,
      time: Date.now(),
    });
  }

  function handleTouchStart(event) {
    if (event.touches.length > 0) {
      touchData.push({
        type: "start",
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        time: Date.now(),
      });
    }
  }

  function handleTouchMove(event) {
    if (event.touches.length > 0) {
      touchData.push({
        type: "move",
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        time: Date.now(),
      });
    }
  }

  function trackInjectedContent() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
          mutation.addedNodes.forEach((node) => {
            if (node.tagName === "SCRIPT") {
              injectedScripts.push(node.src || node.innerHTML);
            } else if (node.tagName === "LINK" && node.rel === "stylesheet") {
              injectedLinks.push(node.href);
            }
          });
        }
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  window.addEventListener("load", () => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("touchstart", handleTouchStart);
    document.addEventListener("touchmove", handleTouchMove);
    trackInjectedContent();
  });

  class AcidCheck {
    CHALLENGE_TOKEN = null;
    CHALLENGE_LOGIN = null;
    AUTH_UPDATE_MODE = false;
    faceImages = [];
    IS_WEBCAM_ACTIVE = false;
    SESSION_ID = null;
    AUTH_TOKEN = null;
    VERIFY_HEADING = "Choose Verification Method";
    VERIFY_TEXT = "Choose preferred means to verify your identity";
    UPDATE_HEADING = "Update Verification Methods";
    UPDATE_TEXT = "Choose a verification method to update";
    colorDefined = {
      primary: "#3b82f6",
      success: "#10b981",
      danger: "#ef4444",
      warning: "#f59e0b",
      default: "#333",
      error: "#ef4444",
    };

    retryCount = 0;
    maxRetries = 2;

    constructor(acid, email, baseURI = "http://localhost:9088/api/v1") {
      this.acid = acid;
      this.email = email;
      this.baseURI = baseURI;
    }

    async initialize() {
      try {
        const position = await this.getLocation();
        const token = localStorage.getItem("trusted_device_token");
        const trustInfo = await this.checkTrustedUser(
          this.acid,
          position,
          token
        );

        if (trustInfo.challenge != 0) {
          await this.checkUserPresence(trustInfo);
        } else {
          this.finishAuth();
        }
      } catch (error) {
        console.error("Error:", error);
        this.showToast("Failed to initialize", 3000, "danger");
      }
    }

    async initializeUpdate() {
      try {
        this.createAuthModal(true);
      } catch (error) {
        console.error("Error:", error);
        this.showToast("Failed to initialize", 3000, "danger");
      }
    }

    async verifyPin(token) {
      const deviceToken = localStorage.getItem("trusted_device_token");

      const formData = {
        acid: this.acid,
        otp: token,
        deviceToken,
        loginAID: this.SESSION_ID,
      };

      try {
        const response = await fetch(`${this.baseURI}/verify-totp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
          console.error("Error verifying OTP:", result);
          this.showToast(
            result.error || "Failed to verify OTP",
            3000,
            "danger"
          );
          return false;
        }
        console.log("verify result: ", result);

        this.successAuth(true);
        return result;
      } catch (err) {
        console.error("Error verifying OTP:", err);
        this.showToast("Failed to verify OTP", 3000, "danger");
        return false;
      }
    }

    async verifyTPN(token) {
      const rm = document.getElementById("tpn-error");
      if (rm) rm.remove();

      const formData = {
        acid: this.acid,
        email: this.email,
        otp: token,
        loginAID: this.SESSION_ID,
      };

      try {
        const response = await fetch(`${this.baseURI}/verify-tpn`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        if (!result.success) {
          const mainElement = document.getElementById("tpn-pin-ct");
          console.error("Error registering TPN:", result);
          this.showToast(
            result.error || "Failed to verify TPN",
            3000,
            "danger"
          );
          const siblingElement = document.createElement("p");
          siblingElement.id = "tpn-error";
          siblingElement.style.color = "red";
          siblingElement.textContent = result.error;
          mainElement.parentNode.insertBefore(
            siblingElement,
            mainElement.nextSibling
          );
          return false;
        }
        console.log("verify result: ", result);
        this.setAuthToken(result.loginToken);

        if (result.deviceToken) {
          this.saveUser(result.deviceToken);
        }
        this.successAuth(null, true);
        return result;
      } catch (err) {
        console.error("Error verifying OTP:", err);
        this.showToast("Failed to verify TPN", 3000, "danger");
        return false;
      }
    }

    async sendOtp() {
      const deviceToken = localStorage.getItem("trusted_device_token");

      const formData = {
        acid: this.acid,
        email: this.email,
        deviceToken,
        loginAID: this.SESSION_ID,
      };

      try {
        const response = await fetch(`${this.baseURI}/send-tpn`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
          console.error("Error registering TPN:", result);
          this.showToast(result.error || "Failed to send OTP", 3000, "danger");
          this.stopTPN();
          this.resetAuthElements();
          return false;
        }
        console.log("verify result: ", result);
        // this.successAuth(true);
        return result;
      } catch (err) {
        console.error("Error verifying OTP:", err);
        this.showToast("Failed to send OTP", 3000, "danger");
        return false;
      }
    }

    async requestQR() {
      try {
        const response = await fetch(
          `${this.baseURI}/generate-totp?acid=${this.acid}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        console.log("qr result: ", result);
        const imgBox = document.getElementById("qr-auth-img");
        imgBox.src = result.qrCodeDataURL;
        imgBox.style.display = "flex";
        const continueButton = document.getElementById("qr-continue");
        continueButton.textContent = "Continue";
        continueButton.onclick = function () {
          //unhide;
          const pinContainer = document.getElementById("qr-pin-ct");
          imgBox.style.display = "none";
          pinContainer.style.display = "flex";
          document.getElementById("qr-continue").style.display = "none";
          const cancelButton = document.getElementById("qr-cancel");
          const verifyButton = document.getElementById("qr-verify");
          verifyButton.style.display = "inherit";
          cancelButton.style.display = "inherit";
          document.getElementById("headingText").textContent =
            "Token Verification";
          document.getElementById("infoText").textContent =
            "Enter OTP registered via Microsoft/Google Authenticator";
        };
        return result;
      } catch (err) {
        console.error("Error getting secret:", err);
        this.showToast("Failed to request QR", 3000, "danger");
        return false;
      }
    }

    async registerTPN() {
      //todo: update token
      try {
        const rm = document.getElementById("tpn-error");
        if (rm) rm.remove();

        const tpnInput = document.getElementById("tpn-auth-input");
        const tpn = document.getElementById("tpn-auth-input").value;
        const response = await fetch(`${this.baseURI}/register-tpn`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            acid: this.acid,
            tpn: tpn,
            email: this.email,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        if (!result.success) {
          console.error("Error registering TPN:", result);
          this.showToast(
            result.error || "Failed to register TPN",
            3000,
            "danger"
          );
          const siblingElement = document.createElement("p");
          siblingElement.id = "tpn-error";
          siblingElement.style.color = "red";
          siblingElement.textContent = result.error;
          tpnInput.parentNode.insertBefore(
            siblingElement,
            tpnInput.nextSibling
          );
          return false;
        }
        console.log("tpn result: ", result);

        const pinContainer = document.getElementById("tpn-pin-ct");
        pinContainer.style.display = "flex";
        document.getElementById("tpn-continue").style.display = "none";
        const cancelButton = document.getElementById("tpn-cancel");
        const verifyButton = document.getElementById("tpn-verify");
        verifyButton.style.display = "inherit";
        cancelButton.style.display = "inherit";
        document.getElementById("headingText").textContent =
          "Trusted Party Verification";
        document.getElementById("infoText").textContent =
          "Enter the 6 digit code sent to " + tpn;
        //todo: mask tpn number or only for verify?

        return result;
      } catch (err) {
        console.error("Error getting secret:", err);
        this.showToast("Failed to register TPN", 3000, "danger");
        return false;
      }
    }

    async saveUser(token) {
      localStorage.setItem("trusted_device_token", token);
    }

    setAuthToken(token) {
      if (token) {
        this.AUTH_TOKEN = token;
      }
    }

    async checkTrustedUser(acid, position, token) {
      const result = {
        data: await this.getBotness(),
        acid: acid,
        token: token,
        position: position,
        injectedLinks: injectedLinks,
        injectedScripts: injectedScripts,
      };

      try {
        const response = await fetch(`${this.baseURI}/identity`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(result),
        });

        if (!response.ok) {
          throw new Error(
            `Network response was not ok: ${response.statusText}`
          );
        }

        const data = await response.json();
        console.log("trust", data);
        if (data.challenge == 0) this.setAuthToken(data.loginToken);
        if (!token) {
          this.saveUser(data.deviceToken);
        }
        if (data.loginAID) {
          this.SESSION_ID = data.loginAID;
        }
        return data;
      } catch (error) {
        this.showToast("Failed to check trusted user", 3000, "danger");
        console.error("Failed to check trusted user:", error);
        return { error: error.message };
      }
    }

    async getLocation() {
      return new Promise((resolve) => {
        //todo: if denied, we should first show a notice modal that domain.org needs this information
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              });
            },
            () => {
              resolve({ latitude: "unknown", longitude: "unknown" });
            }
          );
        } else {
          resolve({ latitude: "unknown", longitude: "unknown" });
        }
      });
    }

    async getChallengeToken(isLogin = false) {
      if (isLogin) {
        if (this.CHALLENGE_LOGIN) return this.CHALLENGE_LOGIN;
      } else {
        if (this.CHALLENGE_TOKEN) return this.CHALLENGE_TOKEN;
      }
      const curl = isLogin ? "generate-login" : "generate-challenge";
      const response = await fetch(`${this.baseURI}/${curl}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          acid: this.acid,
        }),
      });

      const data = await response.json();

      if (isLogin) {
        this.CHALLENGE_LOGIN = data;
      } else {
        this.CHALLENGE_TOKEN = data;
      }
      //todo: handle errors
      return data;
    }

    async registerUserCredentials() {
      try {
        const payload = await this.getChallengeToken();
        //todo: consider using an update token to actually do this which should give us user name
        //use ACID for now but should probably be NAME (ACID)

        const publicKey = preformatMakeCredReq(payload);

        const credential = await navigator.credentials.create({ publicKey });
        const credResponse = publicKeyCredentialToJSON(credential);
        const authData = encode(credential.response.getAuthenticatorData());

        // Send result to server for verification and storage
        const resp = await this.sendToServer(
          {
            acid: this.acid,
            payload: credResponse,
            authenticatorData: authData,
          },
          "/credentials/register"
        );
        if (resp.message) {
          await this.finishAuth();
        }
      } catch (error) {
        this.showToast("Error during registration:", 3000, "danger");
        console.error("Error during registration:", error);
      }
    }

    async verifyUserCredentials() {
      try {
        const challengeData = await this.getChallengeToken(true);
        console.log("data", challengeData);

        const publicKey = preformatGetAssertReq(challengeData);
        const credentials = await navigator.credentials.get({ publicKey });
        const getAssertionResponse = publicKeyCredentialToJSON(credentials);

        console.log("Authentication successful", getAssertionResponse);
        this.showToast("Authentication successful", 3000, "success");
        // Send result to server for verification
        const response = await this.sendToServer(
          {
            acid: this.acid,
            payload: getAssertionResponse,
            loginAID: this.SESSION_ID,
          },
          "/credentials/verify"
        );
        console.log("resp:", response);
        if (response.message) {
          this.setAuthToken(response.loginToken);
          this.saveUser(response.deviceToken);
          //todo: some notify message?
          await this.finishAuth();
        }
        return response;
      } catch (error) {
        this.showToast("Error during authentication:", 3000, "danger");
        console.error("Error during authentication:", error);
      }
    }

    async sendToServer(data, endpoint) {
      try {
        const response = await fetch(`${this.baseURI}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          console.error(`Failed to send data to ${endpoint}`);
          this.showToast(`Failed to send data to ${endpoint}`, 3000, "danger");
        } else {
          console.log(`Data sent to ${endpoint} successfully`);
          this.showToast(
            `Data sent to ${endpoint} successfully`,
            3000,
            "success"
          );
          return await response.json();
        }
      } catch (error) {
        this.showToast(`Error sending data to ${endpoint}`, 3000, "danger");

        console.error(`Error sending data to ${endpoint}:`, error);
      }
    }

    async checkUserPresence(trustInfo) {
      const { challenge, userFaceCaptured, webAuthnCaptured, totpCaptured } =
        trustInfo;
      //todo: utilize capture in figuring out the modal content
      //if nothing available, do a manual video recording upload/login request
      //send notification to fraud team on backend
      this.createAuthModal();
    }

    async isWebcamAvailable() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        stream.getTracks().forEach((track) => track.stop());
        return true;
      } catch (error) {
        this.showToast("Webcam is not available", 3000, "danger");

        console.error("Webcam is not available:", error);
        return false;
      }
    }

    createAuthModal(isUpdate = false) {
      this.AUTH_UPDATE_MODE = isUpdate;
      const authOverlay = document.createElement("div");
      authOverlay.id = "auth-overlay";
      authOverlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        background-color: rgba(17, 24, 39, 0.5);
      `;
      authOverlay.onclick = () => {
        this.removeAuthModal();
      };

      const modalCard = document.createElement("div");
      modalCard.id = "acidModalBody";
      modalCard.style.cssText = `
        max-width: 28rem;
        width: 100%;
        background-color: #f1f5f9;
        border-radius: 0.5rem;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
        padding: 2rem;
        text-align: center;
        z-index:20;
      `;
      modalCard.onclick = function (event) {
        event.stopPropagation();
      };

      const modalClose = document.createElement("span");
      modalClose.id = "modalClose";
      modalClose.textContent = "✖";
      modalClose.style.cssText = `
        float:right;
        right: -20px;
        top: -20px;
        font-size: 18px;
      `;
      modalClose.onclick = () => {
        this.removeAuthModal();
      };

      const heading = document.createElement("h2");
      heading.id = "headingText";
      heading.textContent = isUpdate
        ? this.UPDATE_HEADING
        : this.VERIFY_HEADING;
      heading.style.cssText = `
        font-size: 1.5rem;
        font-family: system-ui, sans-serif;
        line-height: 2rem;
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 0.5rem;
      `;

      const subheading = document.createElement("p");
      subheading.id = "infoText";
      subheading.textContent = isUpdate ? this.UPDATE_TEXT : this.VERIFY_TEXT;
      subheading.style.cssText = `
        font-size: 0.85rem;
        font-family: system-ui, sans-serif;
        line-height: 1rem;
        color: #1f2937;
        margin-bottom: 1rem;
      `;

      const boxContainer = document.createElement("div");
      boxContainer.id = "box-container";
      boxContainer.style.cssText = `
        position: relative;
        overflow: hidden;
        display: grid;
        border-radius: 0.5rem;
        width: 100%;
        height: 200px;
        margin-bottom: 1rem;
      `;

      // Create a <style> element to hold the additional styles
      const style = document.createElement("style");
      style.textContent = `
        .aTab-button:hover {
          background-color: #d1d5db!important;
          color: #1f2937;
        }
        .aTab-button:focus-visible {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }
        .aTab-button:disabled {
          pointer-events: none;
          opacity: 0.5;
        }
      `;
      // Append the <style> element to the document head
      document.head.appendChild(style);

      const deviceButton = this.createAuthButton(
        "device-button",
        isUpdate ? "Update Biometrics" : "Device Biometrics",
        "home",
        isUpdate
          ? () => {
              this.registerUserCredentials();
            }
          : () => {
              this.verifyUserCredentials();
            }
      );
      boxContainer.appendChild(deviceButton);
      const cameraButton = this.createAuthButton(
        "camera-button",
        isUpdate ? "Update Photo" : "Face Verification",
        "camera",
        () => {
          this.startWebcam();
        }
      );
      boxContainer.appendChild(cameraButton);
      const otpButton = this.createAuthButton(
        "otp-button",
        isUpdate ? "Update QR Code/PIN" : "QR Code/PIN",
        "key",
        () => {
          this.startOTP();
        }
      );
      boxContainer.appendChild(otpButton);
      const securityButton = this.createAuthButton(
        "sec-button",
        isUpdate ? "Update Trusted Party" : "Trusted Party Auth",
        "question",
        () => {
          this.activateTPNElements();
        }
      );
      boxContainer.appendChild(securityButton);

      modalCard.appendChild(modalClose);
      modalCard.appendChild(heading);
      modalCard.appendChild(subheading);
      modalCard.appendChild(boxContainer);
      authOverlay.appendChild(modalCard);
      document.body.appendChild(authOverlay);
      this.createWebcamElements();
      this.createQRAuthElements();
      this.createTPNModal();
    }

    removeAuthModal() {
      const element = document.getElementById("auth-overlay");
      element.remove();
    }

    createAuthButton(id, buttonText, icon, clickFunc) {
      const authButton = document.createElement("button");
      authButton.id = id;
      authButton.classList.add("aTab-button");
      authButton.textContent = buttonText;
      authButton.onclick = clickFunc;
      authButton.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        border-radius: 0.375rem;
        font-family: system-ui, sans-serif;
        font-size: 0.875rem;
        font-weight: 500;
        transition: color 0.2s;
        outline: none;
        border: 1px solid #d1d5db;
        background-color: #f9fafb;
        color: #111827;
        height: 2.3rem;
        padding: 0 1rem;
        padding-top: 0.5rem;
        padding-bottom: 0.5rem;
        cursor: pointer;
        margin-top: 0.5rem;
        margin-left: 1rem;
        margin-right: 1rem;
      `;

      const deviceIcon = document.createElement("svg");
      deviceIcon.style.height = "1.5rem";
      deviceIcon.style.width = "1.5rem";
      deviceIcon.style.transition = "all 0.3s ease-out";
      deviceIcon.setAttribute("fill", "currentColor");
      deviceIcon.innerHTML = this.getIconSVG(icon);
      authButton.appendChild(deviceIcon);
      return authButton;
    }

    getIconSVG(iconName) {
      switch (iconName) {
        case "home":
          return `<path fill-rule="evenodd" clip-rule="evenodd" d="M12.707 2.293a1 1 0 00-1.414 0l-9 9a1 1 0 101.414 1.414L4 12.414V21a1 1 0 001 1h5a1 1 0 001-1v-6h2v6a1 1 0 001 1h5a1 1 0 001-1v-8.586l.293.293a1 1 0 001.414-1.414l-9-9zM18 10.414l-6-6-6 6V20h3v-6a1 1 0 011-1h4a1 1 0 011 1v6h3v-9.586z" />`;
        case "camera":
          return `<path fill-rule="evenodd" clip-rule="evenodd" d="M11.617 1.076a1 1 0 011.09.217l5.657 5.657a9 9 0 11-13.113.41A1 1 0 017 8.022v2.292a2 2 0 104 0V2a1 1 0 01.617-.924zM13 4.414v5.9A4 4 0 015.212 11.6 7 7 0 1016.95 8.364L13 4.414z" />`;
        case "key":
          return `<path fill-rule="evenodd" clip-rule="evenodd" d="M12 7a1 1 0 011-1h8a1 1 0 011 1v8a1 1 0 11-2 0V8h-7a1 1 0 01-1-1z" /><path fill-rule="evenodd" clip-rule="evenodd" d="M20.707 7.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0L9 12.414l-5.293 5.293a1 1 0 01-1.414-1.414l6-6a1 1 0 011.414 0L13 13.586l6.293-6.293a1 1 0 011.414 0z" />`;
        case "question":
          return `<path fill-rule="evenodd" clip-rule="evenodd" d="M7 10a3 3 0 013-3h8a3 3 0 013 3v8a3 3 0 01-3 3h-8a3 3 0 01-3-3v-8zm3-1a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1v-8a1 1 0 00-1-1h-8z" /><path fill-rule="evenodd" clip-rule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 110 2H6a1 1 0 00-1 1v10a1 1 0 11-2 0V6z" />`;
        default:
          return "";
      }
    }

    async getBotness() {
      const userAgent = navigator.userAgent;
      const language = navigator.language;
      const languages = navigator.languages.join(",");
      const screenResolution = `${window.screen.width}x${window.screen.height}`;
      const screenDpi = window.devicePixelRatio;
      const hardwareConcurrency = navigator.hardwareConcurrency || 4;
      const deviceMemory = navigator.deviceMemory || "unknown";
      const vendor = navigator.vendor || "unknown";
      const platform = navigator.platform || "unknown";
      const appVersion = navigator.appVersion || "unknown";
      const maxTouchPoints = navigator.maxTouchPoints || 0;
      const cookieEnabled = navigator.cookieEnabled || false;
      const doNotTrack = navigator.doNotTrack || "unknown";

      let uaData = {};
      if (navigator.userAgentData) {
        uaData = await navigator.userAgentData.getHighEntropyValues([
          "platform",
          "model",
          "uaFullVersion",
          "brands",
        ]);
      }

      const battery = await navigator
        .getBattery()
        .catch(() => ({ level: "unknown", charging: "unknown" }));
      const connection = navigator.connection || {};
      const effectiveType = connection.effectiveType || "unknown";
      const downlink = connection.downlink || "unknown";

      // Permissions API check
      const permissions = {
        geolocation: await navigator.permissions
          .query({ name: "geolocation" })
          .then((permission) => permission.state)
          .catch(() => "unknown"),
        notifications: await navigator.permissions
          .query({ name: "notifications" })
          .then((permission) => permission.state)
          .catch(() => "unknown"),
      };

      // Gamepad API check
      const gamepads = navigator.getGamepads
        ? Array.from(navigator.getGamepads()).filter((gamepad) => gamepad)
            .length
        : 0;

      // PublicKeyCredential availability check
      const publicKeyCredentialAvailable = !!window.PublicKeyCredential;

      // Camera/Media Device availability check
      const mediaDevicesAvailable =
        !!navigator.mediaDevices && !!navigator.mediaDevices.enumerateDevices;

      const capabilities = {
        touch: "ontouchstart" in window,
        canvas: !!window.CanvasRenderingContext2D,
        webGL: !!window.WebGLRenderingContext,
        localStorage: !!window.localStorage,
        indexedDB: !!window.indexedDB,
        geolocation: !!navigator.geolocation,
        notifications: !!window.Notification,
        webRTC: !!window.RTCPeerConnection,
        plugins: navigator.plugins?.length > 0,
        worker: !!navigator.serviceWorker,
        webDriver: !!navigator.webdriver,
        wasActive: navigator.userActivation?.hasBeenActive ?? "unknown",
        language,
        languages,
        screenResolution,
        screenDpi,
        hardwareConcurrency,
        deviceMemory,
        vendor,
        platform,
        appVersion,
        maxTouchPoints,
        cookieEnabled,
        doNotTrack,
        uaData,
        battery: {
          level: battery.level,
          charging: battery.charging,
        },
        connection: {
          effectiveType,
          downlink,
        },
        permissions,
        gamepads,
        publicKeyCredentialAvailable,
        mediaDevicesAvailable,
      };

      return {
        userAgent,
        capabilities,
        pageHtml: document.documentElement.outerHTML,
        events: { mouseData, touchData },
      };
    }

    createResultOverlay() {
      const resultOverlay = document.createElement("div");
      resultOverlay.id = "resultOverlay";
      resultOverlay.style.cssText =
        "display: none; flex-direction: column; align-items: center; justify-content: center; gap: 1.5rem; padding: 2rem; padding-bottom: 0px;";

      const resultIconContainer = document.createElement("div");
      resultIconContainer.style.cssText =
        "position: relative; display: flex; height: 200px; width: 200px; margin: 0px auto; align-items: center; justify-content: center; border-radius: 50%; background-color: #e1e5e9;";

      const resultIcon = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      resultIcon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      resultIcon.setAttribute("viewBox", "0 0 24 24");
      resultIcon.setAttribute("fill", "none");
      resultIcon.setAttribute("stroke", "currentColor");
      resultIcon.setAttribute("stroke-width", "2");
      resultIcon.style.cssText = "height: 5rem; width: 5rem; color: #48bb78;";

      const resultPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      resultPath.setAttribute("stroke-linecap", "round");
      resultPath.setAttribute("stroke-linejoin", "round");
      resultPath.setAttribute("d", "M20 6L9 17l-5-5");

      resultIcon.appendChild(resultPath);
      resultIconContainer.appendChild(resultIcon);

      const resultTextContainer = document.createElement("div");
      resultTextContainer.style.cssText = "text-align: center;";

      const resultText = document.createElement("p");
      resultText.style.cssText =
        "color: #718096;font-family: system-ui,sans-serif;";
      resultText.textContent = "You can now proceed to the next step.";

      resultTextContainer.appendChild(resultText);
      resultOverlay.appendChild(resultIconContainer);
      resultOverlay.appendChild(resultTextContainer);
      return resultOverlay;
    }

    createWebcamElements() {
      const webcamContainer = document.createElement("div");
      webcamContainer.id = "webcam-container";
      webcamContainer.style.cssText = `
        display: none;
        position: relative;
        overflow: hidden;
        border-radius: 0.5rem;
        width: 100%;
        height: 240px;
        margin-bottom: 1rem;
      `;

      const webcamElement = document.createElement("video");
      webcamElement.id = "webcam";
      webcamElement.playsInline = true;
      webcamElement.setAttribute("webkit-playsinline", "");
      webcamElement.autoplay = true;
      webcamElement.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotateY(180deg);
      -webkit-transform: translate(-50%, -50%) rotateY(180deg);
      -moz-transform: translate(-50%, -50%) rotateY(180deg);
      width: 100%;
      height: 100%;
      object-fit: cover;
    `;
      const canvasElement = document.createElement("canvas");
      canvasElement.id = "canvas";
      canvasElement.width = 640;
      canvasElement.height = 480;
      canvasElement.style.cssText = `
        display: none;
      `;

      const overlayCircle = document.createElement("div");
      overlayCircle.id = "overlay-circle";
      overlayCircle.style.cssText = `
        position: absolute;
        opacity: 0.5;
        top: 25px;
        width: 190px;
        height: 190px;
        left: calc(50% - 95px);
        border: 4px dotted rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        pointer-events: none;
        z-index: 10;
        background-color: rgba(54, 54, 54, 0.5);
      `;

      // Create a <style> element to hold the additional styles
      const style = document.createElement("style");
      style.textContent = `
        #verify-button:hover {
          background-color: #d1d5db!important;
          color: #1f2937;
        }
        #verify-button:focus-visible {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }
        #verify-button:disabled {
          pointer-events: none;
          opacity: 0.5;
        }
      `;
      // Append the <style> element to the document head
      document.head.appendChild(style);
      const resultOverlay = this.createResultOverlay();

      webcamContainer.appendChild(webcamElement);
      webcamContainer.appendChild(canvasElement);
      webcamContainer.appendChild(overlayCircle);

      const modalCard = document.getElementById("acidModalBody");
      modalCard.appendChild(webcamContainer);
      modalCard.appendChild(resultOverlay);
    }

    createQRAuthElements() {
      const qrAuthContainer = document.createElement("div");
      qrAuthContainer.id = "qr-auth-container";
      qrAuthContainer.style.cssText = `
        display: none;
        margin-top: 42px;
        margin-bottom: 60px;
        position: relative;
        width: 100%;
        text-align: center;
      `;

      let scanImage = null;

      if (this.AUTH_UPDATE_MODE) {
        scanImage = document.createElement("img");
        scanImage.id = "qr-auth-img";
        scanImage.alt = "Loading..."; //todo: we can do better lol
        scanImage.style.cssText = `
          display: none;
          margin: 42px auto;
          position: relative;
          height: 160px;
          width: 160px;
          text-align: center;
        `;
      }

      const pinContainer = document.createElement("div");
      pinContainer.id = "qr-pin-ct";
      pinContainer.style.cssText = `
        display: flex;
        gap: 0.75rem;
        margin-bottom: 2.4rem;
        justify-content: center;
        align-items: center;
      `;

      for (let i = 0; i < 6; i++) {
        const pinInput = document.createElement("input");
        pinInput.type = "password";
        pinInput.maxLength = 1;
        pinInput.className = "qr-pi";
        pinInput.style.cssText = `
          width: 1.6rem;
          height: 1.3rem;
          text-align: center;
          border: 1px solid #e2e8f0;
          border-radius: 0.375rem;
          font-size: 0.975rem;
          padding: 0.5rem;
          outline: none;
        `;

        pinInput.oninput = (event) => {
          const target = event.target;
          if (target.value.length > 1) {
            target.value = target.value.charAt(0); // Ensure only one character is input
          }
          if (target.value.length === target.maxLength) {
            if (target.nextElementSibling) {
              target.nextElementSibling.focus();
            } else {
              const pinCode = Array.from(pinContainer.querySelectorAll("input"))
                .map((input) => input.value)
                .join("");
              this.verifyPin(pinCode);
              //attempt auto verify
              //todo: if verification fails, reset pin input
            }
          }
        };

        pinInput.onkeydown = (event) => {
          const target = event.target;
          if (event.key === "Backspace") {
            if (target.value === "" && target.previousElementSibling) {
              target.previousElementSibling.focus();
              target.previousElementSibling.value = ""; // Clear previous input
            }
          } else if (
            event.key === "ArrowLeft" &&
            target.previousElementSibling
          ) {
            target.previousElementSibling.focus();
          } else if (event.key === "ArrowRight" && target.nextElementSibling) {
            target.nextElementSibling.focus();
          } else if (event.key === " ") {
            event.preventDefault(); // Prevent space from being input
          }
        };

        pinInput.onfocus = (event) => {
          event.target.select(); // Select the content of the input on focus
        };

        pinContainer.appendChild(pinInput);
      }

      const verifyButton = document.createElement("button");
      verifyButton.id = "qr-verify";
      verifyButton.textContent = "Verify";
      verifyButton.className = "qr-verify";
      verifyButton.style.cssText = `
        padding: 0.5rem 1rem;
        font-size: 1rem;
        font-weight: 600;
        color: #ffffff;
        background-color: #48bb78;
        border: none;
        border-radius: 0.375rem;
        cursor: pointer;
        transition: background-color 0.3s ease;
      `;
      verifyButton.onclick = () => {
        const pinCode = Array.from(pinContainer.querySelectorAll("input"))
          .map((input) => input.value)
          .join("");
        console.log("verifying PIN:", pinCode);
        this.verifyPin(pinCode);
      };

      const continueButton = document.createElement("button");
      continueButton.id = "qr-continue";
      continueButton.textContent = "Request Code";
      continueButton.className = "qr-continue";
      continueButton.style.cssText = `
        padding: 0.5rem 1rem;
        font-size: 1rem;
        font-weight: 600;
        color: #ffffff;
        background-color: #48bb78;
        border: none;
        border-radius: 0.375rem;
        cursor: pointer;
        transition: background-color 0.3s ease;
      `;
      continueButton.onclick = () => {
        this.requestQR();
      };

      const cancelButton = document.createElement("button");
      cancelButton.id = "qr-cancel";
      cancelButton.textContent = "Cancel";
      cancelButton.className = "qr-cancel";
      cancelButton.style.cssText = `
        padding: 0.5rem 1rem;
        font-size: 1rem;
        font-weight: 600;
        color: #4a5568;
        background-color: #edf2f7;
        border: 1px solid #cbd5e0;
        border-radius: 0.375rem;
        cursor: pointer;
        transition: background-color 0.3s ease;
      `;
      cancelButton.onclick = () => {
        this.stopQR();
        this.resetAuthElements();
      };

      const buttonContainer = document.createElement("div");
      buttonContainer.style.cssText = `
        display: flex;
        justify-content: center;
        gap: 1rem;
        margin-top: 1rem;
      `;
      buttonContainer.appendChild(cancelButton);

      if (this.AUTH_UPDATE_MODE) {
        pinContainer.style.display = "none";
        qrAuthContainer.appendChild(scanImage);
        buttonContainer.appendChild(continueButton);
        verifyButton.style.display = "none";
        // cancelButton.style.display = "none";
      }

      buttonContainer.appendChild(verifyButton);

      qrAuthContainer.appendChild(pinContainer);
      qrAuthContainer.appendChild(buttonContainer);

      const modalCard = document.getElementById("acidModalBody");
      modalCard.appendChild(qrAuthContainer);

      // Append styles to the document head
      const style = document.createElement("style");
      style.textContent = `
        .qr-pi:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 1px #3b82f6;
        }
        .qr-pi:focus-visible {
          outline: none;
        }
        .qr-verify:hover {
          background-color: #38a169!important;
        }
        .qr-verify:focus {
          outline: 2px solid #38a169;
          outline-offset: 2px;
        }
        .qr-verify:disabled {
          pointer-events: none;
          opacity: 0.5;
        }
        .qr-cancel:hover {
          background-color: #cbd5e0!important;
        }
        .qr-cancel:focus {
          outline: 2px solid #4a5568;
          outline-offset: 2px;
        }
      `;
      document.head.appendChild(style);
    }

    activateQRElements() {
      const heading = document.getElementById("headingText");
      heading.textContent = this.AUTH_UPDATE_MODE
        ? "QR Token Update"
        : "Token Verification";

      const subheading = document.getElementById("infoText");
      subheading.textContent = this.AUTH_UPDATE_MODE
        ? "Scan the QR Code below with Microsoft or Google Authenticator"
        : "Enter OTP registered via Microsoft/Google Authenticator";

      const boxContainer = document.getElementById("box-container");
      boxContainer.style.display = "none";

      const qrContainer = document.getElementById("qr-auth-container");
      qrContainer.style.display = "block";
      if (this.AUTH_UPDATE_MODE) {
        this.requestQR();
      } else {
        const pinInputs = document.getElementsByClassName("qr-pi");
        pinInputs[0].focus();
      }
    }

    activateTPNElements() {
      const heading = document.getElementById("headingText");
      heading.textContent = this.AUTH_UPDATE_MODE
        ? "Trusted Party Number Update"
        : "Trusted Party Authentication";

      const subheading = document.getElementById("infoText");
      subheading.textContent = this.AUTH_UPDATE_MODE
        ? "Enter a trusted phone number which can help authenticate you if your device is compromised"
        : "Enter the 6 digit code sent to the trusted party on your account";

      const boxContainer = document.getElementById("box-container");
      boxContainer.style.display = "none";

      const qrContainer = document.getElementById("tpn-auth-container");
      qrContainer.style.display = "block";
      if (this.AUTH_UPDATE_MODE) {
        document.getElementById("tpn-auth-input")?.focus();
      } else {
        const pinInputs = document.getElementsByClassName("tpn-pi");
        // Todo send OTP to trusted party
        this.sendOtp();
        pinInputs[0].focus();
      }
    }

    activateWebcamElements() {
      const heading = document.getElementById("headingText");
      heading.textContent = this.AUTH_UPDATE_MODE
        ? "Face Registration/Update"
        : "Identity Verification";

      const subheading = document.getElementById("infoText");
      subheading.textContent = "Make a surprised face in the circle";

      const boxContainer = document.getElementById("box-container");
      boxContainer.style.display = "none";

      const camContainer = document.getElementById("webcam-container");
      camContainer.style.display = "flex";

      const modalCard = document.getElementById("acidModalBody");

      const actionButton = document.createElement("button");
      actionButton.id = "verify-button";
      actionButton.onclick = () => {
        this.stopWebcam();
        this.resetAuthElements();
      };
      actionButton.textContent = "Cancel";
      actionButton.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        border-radius: 0.375rem;
        font-family: system-ui, sans-serif;
        font-size: 0.875rem;
        font-weight: 500;
        transition: color 0.2s;
        outline: none;
        border: 1px solid #d1d5db;
        background-color: #f9fafb;
        color: #111827;
        height: 2.3rem;
        padding: 0 1rem;
        padding-top: 0.5rem;
        padding-bottom: 0.5rem;
        cursor: pointer;
        margin-top: 1rem;
      `;

      modalCard.appendChild(actionButton);
    }

    resetAuthElements() {
      const heading = document.getElementById("headingText");
      heading.textContent = this.AUTH_UPDATE_MODE
        ? this.UPDATE_HEADING
        : this.VERIFY_HEADING;

      const subheading = document.getElementById("infoText");
      subheading.textContent = this.AUTH_UPDATE_MODE
        ? this.UPDATE_TEXT
        : this.VERIFY_TEXT;

      const boxContainer = document.getElementById("box-container");
      boxContainer.style.display = "grid";

      const modalCard = document.getElementById("acidModalBody");

      const actionButton = document.getElementById("verify-button");
      if (actionButton) modalCard.removeChild(actionButton);
    }

    async finishAuth() {
      //todo: do some other magic
      const authOverlay = document.getElementById("auth-overlay");
      if (authOverlay) {
        authOverlay.remove();
      }
      //submit recorded data
      const resp = await this.sendToServer(
        {
          acid: this.acid,
          session_id: this.SESSION_ID,
          token: this.AUTH_TOKEN,
          events,
        },
        "/sessions/finish"
      );
      //todo: disable or reset events collection?
      //events = [];
      console.log("Resp:", resp);
    }

    successAuth(isQrStop = false, isTPN = false) {
      if (isQrStop) {
        this.stopQR();
      } else {
        if (isTPN) {
          this.stopTPN();
        } else {
          this.stopWebcam();
        }
      }
      let actionButton = document.getElementById("verify-button"); //change btn text

      if (!actionButton) {
        actionButton = document.createElement("button");
        actionButton.id = "verify-button";
        actionButton.onclick = () => {
          this.finishAuth();
        };
        actionButton.textContent = "Continue";
        actionButton.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        border-radius: 0.375rem;
        font-family: system-ui, sans-serif;
        font-size: 0.875rem;
        font-weight: 500;
        transition: color 0.2s;
        outline: none;
        border: 1px solid #d1d5db;
        background-color: #f9fafb;
        color: #111827;
        height: 2.3rem;
        padding: 0 1rem;
        padding-top: 0.5rem;
        padding-bottom: 0.5rem;
        cursor: pointer;
        margin-top: 1rem;
      `;
      }

      const modalCard = document.getElementById("acidModalBody");
      modalCard.appendChild(actionButton);

      const resultOverlay = document.getElementById("resultOverlay"); //show result el
      actionButton.onclick = () => {
        document.getElementById("resultOverlay").style.display = "none";
        //todo: authentication complete, supply continue token for dismiss modal
        this.finishAuth();
      };

      if (resultOverlay) {
        resultOverlay.style.display = "block";
      }
      document.getElementById("verify-button").textContent = "Continue";
      const infoText = document.getElementById("infoText"); //change info text
      if (isQrStop) {
        infoText.innerText = this.AUTH_UPDATE_MODE
          ? "QR Code/PIN data successfully updated. Press continue to proceed"
          : "Identity successfully verified. Press continue to proceed";
      } else {
        infoText.innerText = this.AUTH_UPDATE_MODE
          ? "Face data successfully updated. Press continue to proceed"
          : "Identity successfully verified. Press continue to proceed";
      }
    }

    async startWebcam() {
      this.retryCount = 0;
      //todo: consider using loader?
      this.IS_WEBCAM_ACTIVE = true;
      const webcamAvailable = await this.isWebcamAvailable();
      if (webcamAvailable) {
        this.activateWebcamElements();
        this.accessWebcam();
        console.log("Webcam access initiated.");
        this.showToast(
          "Webcam access initiated. Please make a surprised face.",
          3000,
          "warning"
        );
      } else {
        console.log("No webcam available.");
        this.showToast("No webcam available. Please try again.", 3000, "error");
        this.createTPNModal();
        this.showTPNModal();
      }
    }

    async startOTP() {
      //todo: check if available?, consider using loader?
      this.activateQRElements();
    }

    async accessWebcam() {
      const video = document.getElementById("webcam");
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
          video.srcObject = stream;
          video.play();

          // Start capturing photos after accessing the webcam
          setTimeout(
            () => requestAnimationFrame(() => this.captureAndSendPhotos()),
            50
          );
        } catch (error) {
          this.showToast(
            "Error accessing webcam. Please try again.",
            3000,
            "error"
          );

          console.error("Error accessing webcam: ", error);
        }
      } else {
        console.error("User media not supported.");
        this.showToast("User media not supported.", 3000, error);
      }
    }

    stopQR() {
      const qrContainer = document.getElementById("qr-auth-container"); //hide el
      if (qrContainer) {
        qrContainer.style.display = "none";
      }
    }

    stopTPN() {
      const tpnContainer = document.getElementById("tpn-auth-container"); //hide el
      if (tpnContainer) {
        tpnContainer.style.display = "none";
      }
    }

    stopWebcam() {
      this.IS_WEBCAM_ACTIVE = false;
      this.isWebcamAvailable(); //release webcam
      const video = document.getElementById("webcam");
      if (video) {
        video.srcObject = null;
        video.pause();
      }
      const videoContainer = document.getElementById("webcam-container"); //hide video el
      if (videoContainer) {
        videoContainer.style.display = "none";
      }
    }

    captureAndSendPhotos() {
      if (!this.IS_WEBCAM_ACTIVE) return;
      const video = document.getElementById("webcam");
      const canvas = document.getElementById("canvas");
      const context = canvas.getContext("2d");
      this.faceImages = [];
      const numPhotos = 8; // Capture 8 photos
      let photoCount = 0;

      const captureFrame = () => {
        if (photoCount < numPhotos) {
          context.filter = "brightness(1.1) contrast(1.5)";
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataURL = canvas.toDataURL("image/jpeg", 0.75);
          this.faceImages.push(dataURL);
          photoCount++;
          setTimeout(() => requestAnimationFrame(captureFrame), 150); // Capture every 150ms
        } else {
          this.uploadImages(this.faceImages);
        }
      };

      //wait for 1.5s before starting capture
      setTimeout(() => requestAnimationFrame(captureFrame), 500);
    }

    async uploadImages(images) {
      //todo: monitor time it takes for valid face capture
      //advise user on face positioning and cancel for restart after 15s
      const formData = new FormData();

      images.forEach((dataURL, index) => {
        // Convert Base64 to binary data (Blob)
        const byteString = atob(dataURL.split(",")[1]);
        const mimeType = dataURL.split(",")[0].split(":")[1].split(";")[0];
        const byteArray = new Uint8Array(byteString.length);

        for (let i = 0; i < byteString.length; i++) {
          byteArray[i] = byteString.charCodeAt(i);
        }

        const blob = new Blob([byteArray], { type: mimeType });
        formData.append("images", blob, `image_${index}.jpg`);
      });

      try {
        formData.append("acid", this.acid);
        if (this.AUTH_UPDATE_MODE) {
          //todo: fix with actual update token
          formData.append("updateToken", this.AUTH_TOKEN ?? "DEMO_TOKEN");
        }
        formData.append("loginAID", this.SESSION_ID);

        const response = await fetch(`${this.baseURI}/upload`, {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          const resJson = await response.json();
          const result =
            typeof resJson.result === "string"
              ? JSON.parse(resJson.result)
              : resJson.result;

          if (!result || result.error) {
            //start again after 500ms
            if (this.retryCount < this.maxRetries) {
              this.retryCount++;
              //todo: check error type and probably choose another auth type?
              setTimeout(
                () => requestAnimationFrame(() => this.captureAndSendPhotos()),
                500
              );
            } else {
              this.showToast(
                result.error || "Error uploading images. Please try again.",
                3000,
                "error"
              );
              this.stopWebcam();
              this.resetAuthElements();
            }
          } else {
            if (result.countSurprised > 0) {
              this.setAuthToken(resJson.loginToken);
              this.saveUser(resJson.deviceToken);
              this.successAuth();
            } else {
              if (this.retryCount < this.maxRetries) {
                this.retryCount++;

                setTimeout(
                  () =>
                    requestAnimationFrame(() => this.captureAndSendPhotos()),
                  500
                );
              } else {
                this.showToast(
                  result.error || "Error uploading images. Please try again.",
                  3000,
                  "error"
                );
                this.stopWebcam();
                this.resetAuthElements();
              }
            }
          }
        } else {
          console.error("Upload failed:", response.statusText);
          this.showToast(
            `Upload failed: ${response.statusText}`,
            3000,
            "error"
          );
        }
      } catch (error) {
        this.showToast(
          error.error || "Error uploading images. Please try again.",
          3000,
          "error"
        );

        console.error("Error uploading images:", error);
      }
    }

    async recordVideo() {
      const video = document.getElementById("video");
      const chunks = [];
      let mediaRecorder;

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
          mediaRecorder = new MediaRecorder(stream);
          mediaRecorder.start();

          mediaRecorder.ondataavailable = function (event) {
            chunks.push(event.data);
          };

          mediaRecorder.onstop = async () => {
            const blob = new Blob(chunks, { type: "video/webm" });
            const formData = new FormData();
            formData.append("video", blob, "video.webm");

            const response = await fetch(`${this.baseURI}/video/check`, {
              method: "POST",
              body: formData,
            });

            if (response.ok) {
              console.log("Video uploaded successfully.");
              this.showToast("Video uploaded successfully.", 3000, "success");
            } else {
              console.error("Failed to upload video.");
              this.showToast("Failed to upload video.", 3000, "error");
            }
          };

          setTimeout(() => {
            mediaRecorder.stop();
          }, 2000); // Record for 2 seconds
        });
      }
    }

    showTPNModal() {
      this.fetchTPNPrompt().then((question) => {
        document.getElementById("tpnPrompt").innerText = question;
      });
    }

    async fetchTPNPrompt() {
      const response = await fetch(`${this.baseURI}/tpn/question`);
      const data = await response.json();
      return data.question;
    }

    createTPNModal() {
      const tpnAuthContainer = document.createElement("div");
      tpnAuthContainer.id = "tpn-auth-container";
      tpnAuthContainer.style.cssText = `
        display: none;
        margin-top: 42px;
        margin-bottom: 60px;
        position: relative;
        width: 100%;
        text-align: center;
      `;

      let tpnInput = null;

      if (this.AUTH_UPDATE_MODE) {
        tpnInput = document.createElement("input");
        tpnInput.id = "tpn-auth-input";
        tpnInput.type = "tel";
        tpnInput.placeholder = "e.g. 08011122233";
        tpnInput.style.cssText = `
          display: flex;
          margin: 42px auto;
          position: relative;
          height: 1.4rem;
          width: 14rem;
          text-align: center;
          border: 1px solid #e2e8f0;
          border-radius: 0.375rem;
          font-size: 0.975rem;
          padding: 0.5rem;
          outline: none;
        `;
      }

      const pinContainer = document.createElement("div");
      pinContainer.id = "tpn-pin-ct";
      pinContainer.style.cssText = `
        display: flex;
        gap: 0.75rem;
        margin-bottom: 2.4rem;
        justify-content: center;
        align-items: center;
      `;

      for (let i = 0; i < 6; i++) {
        const pinInput = document.createElement("input");
        pinInput.type = "password";
        pinInput.maxLength = 1;
        pinInput.className = "tpn-pi";
        pinInput.style.cssText = `
          width: 1.6rem;
          height: 1.3rem;
          text-align: center;
          border: 1px solid #e2e8f0;
          border-radius: 0.375rem;
          font-size: 0.975rem;
          padding: 0.5rem;
          outline: none;
        `;

        pinInput.oninput = (event) => {
          const target = event.target;
          if (target.value.length > 1) {
            target.value = target.value.charAt(0); // Ensure only one character is input
          }
          if (target.value.length === target.maxLength) {
            if (target.nextElementSibling) {
              target.nextElementSibling.focus();
            } else {
              const pinCode = Array.from(pinContainer.querySelectorAll("input"))
                .map((input) => input.value)
                .join("");
              this.verifyTPN(pinCode);
              //attempt auto verify
              //todo: if verification fails, reset pin input
            }
          }
        };

        pinInput.onkeydown = (event) => {
          const target = event.target;
          if (event.key === "Backspace") {
            if (target.value === "" && target.previousElementSibling) {
              target.previousElementSibling.focus();
              target.previousElementSibling.value = ""; // Clear previous input
            }
          } else if (
            event.key === "ArrowLeft" &&
            target.previousElementSibling
          ) {
            target.previousElementSibling.focus();
          } else if (event.key === "ArrowRight" && target.nextElementSibling) {
            target.nextElementSibling.focus();
          } else if (event.key === " ") {
            event.preventDefault(); // Prevent space from being input
          }
        };

        pinInput.onfocus = (event) => {
          event.target.select(); // Select the content of the input on focus
        };

        pinContainer.appendChild(pinInput);
      }

      const verifyButton = document.createElement("button");
      verifyButton.id = "tpn-verify";
      verifyButton.textContent = "Verify";
      verifyButton.className = "tpn-verify";
      verifyButton.style.cssText = `
        padding: 0.5rem 1rem;
        font-size: 1rem;
        font-weight: 600;
        color: #ffffff;
        background-color: #48bb78;
        border: none;
        border-radius: 0.375rem;
        cursor: pointer;
        transition: background-color 0.3s ease;
      `;
      verifyButton.onclick = () => {
        const pinCode = Array.from(pinContainer.querySelectorAll("input"))
          .map((input) => input.value)
          .join("");
        console.log("verifying PIN:", pinCode);
        this.verifyTPN(pinCode);
      };

      const continueButton = document.createElement("button");
      continueButton.id = "tpn-continue";
      continueButton.textContent = "Update TPN";
      continueButton.className = "tpn-continue";
      continueButton.style.cssText = `
        padding: 0.5rem 1rem;
        font-size: 1rem;
        font-weight: 600;
        color: #ffffff;
        background-color: #48bb78;
        border: none;
        border-radius: 0.375rem;
        cursor: pointer;
        transition: background-color 0.3s ease;
      `;
      continueButton.onclick = () => {
        this.registerTPN();
      };

      const cancelButton = document.createElement("button");
      cancelButton.id = "tpn-cancel";
      cancelButton.textContent = "Cancel";
      cancelButton.className = "tpn-cancel";
      cancelButton.style.cssText = `
        padding: 0.5rem 1rem;
        font-size: 1rem;
        font-weight: 600;
        color: #4a5568;
        background-color: #edf2f7;
        border: 1px solid #cbd5e0;
        border-radius: 0.375rem;
        cursor: pointer;
        transition: background-color 0.3s ease;
      `;
      cancelButton.onclick = () => {
        this.stopTPN();
        this.resetAuthElements();
      };

      const buttonContainer = document.createElement("div");
      buttonContainer.style.cssText = `
        display: flex;
        justify-content: center;
        gap: 1rem;
        margin-top: 1rem;
      `;

      buttonContainer.appendChild(cancelButton);

      if (this.AUTH_UPDATE_MODE) {
        pinContainer.style.display = "none";
        tpnAuthContainer.appendChild(tpnInput);
        buttonContainer.appendChild(continueButton);
        verifyButton.style.display = "none";
        // cancelButton.style.display = "none";
      }

      buttonContainer.appendChild(verifyButton);

      tpnAuthContainer.appendChild(pinContainer);
      tpnAuthContainer.appendChild(buttonContainer);

      const modalCard = document.getElementById("acidModalBody");
      modalCard.appendChild(tpnAuthContainer);

      // Append styles to the document head
      const style = document.createElement("style");
      style.textContent = `
        .tpn-pi:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 1px #3b82f6;
        }
        .tpn-pi:focus-visible {
          outline: none;
        }
        .tpn-verify:hover {
          background-color: #38a169!important;
        }
        .tpn-verify:focus {
          outline: 2px solid #38a169;
          outline-offset: 2px;
        }
        .tpn-verify:disabled {
          pointer-events: none;
          opacity: 0.5;
        }
        .tpn-cancel:hover {
          background-color: #cbd5e0!important;
        }
        .tpn-cancel:focus {
          outline: 2px solid #4a5568;
          outline-offset: 2px;
        }
      `;
      document.head.appendChild(style);
    }

    async submitTPNResponse() {
      const answer = document.getElementById("tpnResponse").value;

      const response = await fetch(`${this.baseURI}/tpn/answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ answer }),
      });
      //todo: handle errors

      if (response.ok) {
        console.log("TPN verified.");
        this.showToast("TPN verified.", 3000, "success");
        document.getElementById("tpnModal").style.display = "none";
      } else {
        console.error("Failed to verify TPN auth.");
        this.showToast("Failed to verify TPN auth.", 3000, "error");
      }
    }

    showToast(message, duration = "3000", color = "default") {
      if (!message) return;
      const toast = document.createElement("div");
      toast.textContent = message;
      toast.style.position = "fixed";
      toast.style.bottom = "20px";
      toast.style.left = "50%";
      toast.style.transform = "translateX(-50%)";
      toast.style.backgroundColor = this.colorDefined[color] || "#333";
      toast.style.color = "#fff";
      toast.style.padding = "10px 20px";
      toast.style.borderRadius = "5px";
      toast.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.1)";
      toast.style.zIndex = "9999";
      toast.style.fontSize = "14px";
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.5s ease";
      document.body.appendChild(toast);

      // Fade in the toast
      setTimeout(() => {
        toast.style.opacity = "1";
      }, 100);

      // Remove the toast after the specified duration
      setTimeout(() => {
        toast.style.opacity = "0";
        // After the fade-out effect, remove the element
        setTimeout(() => {
          document.body.removeChild(toast);
        }, 500); // match the fade-out duration
      }, duration);
    }
  }

  global.AcidCheck = AcidCheck;

  let chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  // Use a lookup table to find the index.
  let lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }

  let encode = function (arraybuffer) {
    let bytes = new Uint8Array(arraybuffer),
      i,
      len = bytes.length,
      base64url = "";

    for (i = 0; i < len; i += 3) {
      base64url += chars[bytes[i] >> 2];
      base64url += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
      base64url += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
      base64url += chars[bytes[i + 2] & 63];
    }

    if (len % 3 === 2) {
      base64url = base64url.substring(0, base64url.length - 1);
    } else if (len % 3 === 1) {
      base64url = base64url.substring(0, base64url.length - 2);
    }

    return base64url;
  };

  let decode = function (base64string) {
    let bufferLength = base64string.length * 0.75,
      len = base64string.length,
      i,
      p = 0,
      encoded1,
      encoded2,
      encoded3,
      encoded4;

    let bytes = new Uint8Array(bufferLength);

    for (i = 0; i < len; i += 4) {
      encoded1 = lookup[base64string.charCodeAt(i)];
      encoded2 = lookup[base64string.charCodeAt(i + 1)];
      encoded3 = lookup[base64string.charCodeAt(i + 2)];
      encoded4 = lookup[base64string.charCodeAt(i + 3)];

      bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }

    return bytes.buffer;
  };

  /**
   * Converts PublicKeyCredential into serialised JSON
   * @param  {Object} pubKeyCred
   * @return {Object}            - JSON encoded publicKeyCredential
   */
  var publicKeyCredentialToJSON = (pubKeyCred) => {
    if (pubKeyCred instanceof Array) {
      let arr = [];
      for (let i of pubKeyCred) arr.push(publicKeyCredentialToJSON(i));

      return arr;
    }

    if (pubKeyCred instanceof ArrayBuffer) {
      return encode(pubKeyCred);
    }

    if (pubKeyCred instanceof Object) {
      let obj = {};

      for (let key in pubKeyCred) {
        obj[key] = publicKeyCredentialToJSON(pubKeyCred[key]);
      }

      return obj;
    }

    return pubKeyCred;
  };

  /**
   * Generate secure random buffer
   * @param  {Number} len - Length of the buffer (default 32 bytes)
   * @return {Uint8Array} - random string
   */
  var generateRandomBuffer = (len) => {
    len = len || 32;

    let randomBuffer = new Uint8Array(len);
    window.crypto.getRandomValues(randomBuffer);

    return randomBuffer;
  };

  /**
   * Decodes arrayBuffer required fields.
   */
  var preformatMakeCredReq = (makeCredReq) => {
    makeCredReq.challenge = decode(makeCredReq.challenge);
    makeCredReq.user.id = decode(makeCredReq.user.id);

    return makeCredReq;
  };

  /**
   * Decodes arrayBuffer required fields.
   */
  var preformatGetAssertReq = (getAssert) => {
    getAssert.challenge = decode(getAssert.challenge);

    for (let allowCred of getAssert.allowCredentials) {
      allowCred.id = decode(allowCred.id);
    }

    return getAssert;
  };
})(window);

export default AcidCheck = window.AcidCheck;
