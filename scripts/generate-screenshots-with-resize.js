#!/usr/bin/env node

import "dotenv/config";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from "fs";

// Get script directory for relative imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Screenshot Generation Script with Resizing for Farcaster Mini Apps
 *
 * This script generates:
 * - Original screenshot (768x512px viewport)
 * - Icon: Resized to 208x208px using Sharp
 * - Splash: Resized to 200x200px using Sharp
 * Environment variables are automatically loaded from .env file using dotenv.
 *
 * Usage:
 *   node scripts/generate-screenshots-with-resize.js
 *   NEXT_PUBLIC_APP_DOMAIN=your-domain.ngrok.app node scripts/generate-screenshots-with-resize.js
 */

// Generation delays (in seconds)
const GENERATION_DELAYS = {
  betweenImages: 2, // Delay between each screenshot
  initialWait: 0, // Initial wait before starting generation
};

// Screenshot configuration
const SCREENSHOT_CONFIG = {
  baseUrl: process.env.BROWSERLESS_API_URL,
  delay: 2, // seconds between screenshots
};

// Icon dimensions (square format, optimized for Farcaster)
const ICON_DIMENSIONS = {
  width: 208,
  height: 208,
};

// Splash dimensions (square format, 200x200 for Farcaster splash)
const SPLASH_DIMENSIONS = {
  width: 200,
  height: 200,
};

// Screenshot viewport dimensions (larger for better quality)
const SCREENSHOT_VIEWPORTS = {
  embed: {
    width: 768, // 3:2 ratio, multiple of 16
    height: 512,
  },
};

/**
 * Sleep utility function to add delays between API calls
 * @param {number} seconds - Number of seconds to wait
 */
async function sleep(seconds) {
  if (seconds > 0) {
    console.log(`⏳ Waiting ${seconds}s to respect rate limits...`);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
}

/**
 * Ensure URL has proper protocol
 * @param {string} url - URL to check
 * @returns {string} - URL with https:// protocol
 */
function ensureProtocol(url) {
  if (!/^https?:\/\//i.test(url)) {
    return `https://${url}`;
  }
  return url;
}

/**
 * Generate timestamp-based filename
 * @param {string} type - The image type (screenshot, icon, splash)
 * @param {string} prefix - The filename prefix (screenshot)
 * @returns {string} - The generated filename
 */
function generateFilename(type, prefix = "screenshot") {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${type}-${timestamp}.png`;
}

/**
 * Resize and save image to specified dimensions using Sharp
 * @param {Buffer} imageBuffer - The source image buffer
 * @param {string} filename - The target filename
 * @param {Object} dimensions - Target dimensions {width, height}
 * @returns {Promise<Object>} - The result with filename and filepath
 */
async function resizeAndSaveImage(imageBuffer, filename, dimensions) {
  try {
    const imagesDir = join(process.cwd(), "public/images");
    
    // Ensure images directory exists
    if (!existsSync(imagesDir)) {
      mkdirSync(imagesDir, { recursive: true });
    }

    // Resize the image
    const resizedBuffer = await sharp(imageBuffer)
      .resize(dimensions.width, dimensions.height, {
        fit: "cover",
        position: "center",
      })
      .png()
      .toBuffer();

    const filepath = join(imagesDir, `${filename}.png`);
    writeFileSync(filepath, resizedBuffer);

    console.log(`💾 Saved resized image: ${filename}.png (${dimensions.width}x${dimensions.height})`);
    return {
      filename: `${filename}.png`,
      filepath,
      buffer: resizedBuffer,
    };
  } catch (error) {
    console.error(`❌ Failed to resize and save image: ${error.message}`);
    throw error;
  }
}

/**
 * Take a screenshot using the browserless API
 * @param {string} url - URL to screenshot
 * @param {Object} viewport - Viewport dimensions {width, height}
 * @param {string} filename - The output filename
 * @returns {Promise<Buffer>} - The screenshot buffer
 */
async function takeScreenshot(url, viewport, filename) {
  console.log(
    `📸 Taking screenshot with viewport ${viewport.width}x${viewport.height}...`,
  );

  try {
    const fullUrl = ensureProtocol(url);
    console.log(`🔗 Using browserless API: ${SCREENSHOT_CONFIG.baseUrl}`);

    // Prepare request body
    const requestBody = {
      url: fullUrl,
      setExtraHTTPHeaders: {
        "ngrok-skip-browser-warning": "true"
      },
      gotoOptions: { waitUntil: "networkidle2" },
      viewport: viewport,
      "waitForTimeout": 30000
      
    };

    console.log(`📋 Request options: ${JSON.stringify(requestBody, null, 2)}`);

    // Make API request
    const apiUrl = `${SCREENSHOT_CONFIG.baseUrl}/screenshot?token=dawdawdwa`;
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}\n${errorText}`,
      );
    }

    // Check if response is actually an image
    const contentType = response.headers.get("content-type");
    if (!contentType?.startsWith("image/")) {
      const errorText = await response.text();
      throw new Error(
        `Expected image response, got ${contentType}\n${errorText}`,
      );
    }

    // Get image data and save original to images directory
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const outputDir = join(process.cwd(), "public", "images");

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = join(outputDir, filename);
    writeFileSync(outputPath, imageBuffer);

    console.log(
      `✅ Screenshot saved: ${filename} (${(imageBuffer.length / 1024).toFixed(2)} KB)`,
    );
    return imageBuffer;
  } catch (error) {
    console.error("❌ Screenshot failed:", error.message);
    throw error;
  }
}

/**
 * Clears all existing screenshot images from the public/images directory
 */
function clearExistingScreenshots() {
  const imagesDir = join(process.cwd(), "public/images");

  if (!existsSync(imagesDir)) {
    return;
  }

  const files = readdirSync(imagesDir);
  const screenshotFiles = files.filter(
    (file) => (file.startsWith("screenshot-embed-") || 
               file.startsWith("screenshot-icon-") || 
               file.startsWith("screenshot-splash-")) && file.endsWith(".png"),
  );

  if (screenshotFiles.length > 0) {
    console.log("🗑️  Clearing existing screenshot images...");
    screenshotFiles.forEach((file) => {
      const filePath = join(imagesDir, file);
      try {
        unlinkSync(filePath);
        console.log(`   Deleted: ${file}`);
      } catch (error) {
        console.warn(`   Failed to delete: ${file}`);
      }
    });
  }
}

/**
 * Updates the farcaster.json file with both icon and splash image URLs
 * @param {string} domain - The domain to use for URLs
 * @param {string} iconFilename - The icon filename
 * @param {string} splashFilename - The splash filename
 */
function updateFarcasterConfigWithImages(domain, iconFilename, splashFilename) {
  try {
    const configPath = join(process.cwd(), "public/.well-known/farcaster.json");

    if (!existsSync(configPath)) {
      console.warn(
        "⚠️  Warning: farcaster.json file not found, skipping update",
      );
      return;
    }

    const configContent = readFileSync(configPath, "utf8");
    const config = JSON.parse(configContent);

    // Get domain URL
    const baseUrl = `https://${domain}`;

    // Update icon and splash URLs
    if (config.miniapp) {
      if (iconFilename) {
        config.miniapp.iconUrl = `${baseUrl}/images/${iconFilename}`;
      }
      if (splashFilename) {
        config.miniapp.splashImageUrl = `${baseUrl}/images/${splashFilename}`;
      }

      // Update home URL to match domain
      config.miniapp.homeUrl = baseUrl;
      config.miniapp.webhookUrl = `${baseUrl}/api/webhook`;
    }

    // Write updated config
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("✅ Updated farcaster.json with new icon and splash URLs");
  } catch (error) {
    console.error("❌ Error updating farcaster.json:", error.message);
  }
}

/**
 * Generate a screenshot with resized versions
 * @param {string} url - The URL to screenshot
 * @param {Object} viewport - The viewport dimensions {width, height}
 * @param {string} type - The image type (embed)
 * @returns {Promise<Object>} - The screenshot results
 */
async function generateScreenshotWithResize(url, viewport, type) {
  const startTime = Date.now();
  console.log(
    `\n📸 Taking ${type} screenshot (${viewport.width}x${viewport.height})...`,
  );
  console.log(`🌐 URL: ${url}`);

  try {
    // Generate original screenshot
    const originalFilename = generateFilename(type, "screenshot");
    const imageBuffer = await takeScreenshot(url, viewport, originalFilename);

    // Generate resized icon (208x208)
    console.log(
      `\n🔄 Resizing to icon dimensions: ${ICON_DIMENSIONS.width}x${ICON_DIMENSIONS.height}px`,
    );
    const iconFilename = generateFilename("icon", "screenshot");
    const iconResult = await resizeAndSaveImage(
      imageBuffer,
      iconFilename,
      ICON_DIMENSIONS,
    );

    // Generate resized splash (200x200)
    console.log(
      `\n🔄 Resizing to splash dimensions: ${SPLASH_DIMENSIONS.width}x${SPLASH_DIMENSIONS.height}px`,
    );
    const splashFilename = generateFilename("splash", "screenshot");
    const splashResult = await resizeAndSaveImage(
      imageBuffer,
      splashFilename,
      SPLASH_DIMENSIONS,
    );

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);

    console.log(`✅ Generated ${type} screenshot and resized versions in ${duration}s`);
    
    return { 
      original: originalFilename,
      icon: iconResult.filename,
      splash: splashResult.filename,
    };
  } catch (error) {
    console.error(`❌ Failed to generate ${type} screenshot:`, error.message);
    throw error;
  }
}

/**
 * Generate a screenshot with retry logic and resizing
 * @param {string} url - The URL to screenshot
 * @param {Object} viewport - The viewport dimensions {width, height}
 * @param {string} type - The image type (embed)
 * @param {number} maxAttempts - Maximum number of retry attempts (default: 3)
 * @param {number} retryDelaySeconds - Delay between retries in seconds (default: 5)
 * @returns {Promise<Object>} - The screenshot result with filename or error summary
 */
async function generateScreenshotWithRetryAndResize(
  url,
  viewport,
  type,
  maxAttempts = 3,
  retryDelaySeconds = 5,
) {
  const failures = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const timestamp = new Date().toISOString();
    console.log(
      `\n🔄 Attempt ${attempt}/${maxAttempts} for ${type} screenshot`,
    );

    try {
      const result = await generateScreenshotWithResize(url, viewport, type);

      if (attempt > 1) {
        console.log(`🎉 Screenshot successful on attempt ${attempt}!`);
      }

      return {
        success: true,
        result: result,
        attempts: attempt,
        failures: failures,
      };
    } catch (error) {
      const failureInfo = {
        attempt: attempt,
        timestamp: timestamp,
        error: error.message,
        type: type,
        viewport: `${viewport.width}x${viewport.height}`,
      };

      failures.push(failureInfo);

      console.error(
        `❌ Attempt ${attempt}/${maxAttempts} failed at ${timestamp}:`,
      );
      console.error(`   Error: ${error.message}`);
      console.error(`   Type: ${type} (${viewport.width}x${viewport.height})`);

      // If this isn't the last attempt, wait before retrying
      if (attempt < maxAttempts) {
        console.log(`⏳ Waiting ${retryDelaySeconds} seconds before retry...`);
        await sleep(retryDelaySeconds);
      } else {
        console.error(
          `💥 All ${maxAttempts} attempts failed for ${type} screenshot`,
        );
      }
    }
  }

  // All attempts failed
  return {
    success: false,
    result: null,
    attempts: maxAttempts,
    failures: failures,
  };
}

/**
 * Main screenshot generation function with resizing
 */
async function generateScreenshots() {
  try {
    // Check for app domain (required for screenshots)
    const appDomain = process.env.SCREENSHOT_URL;
    if (!appDomain) {
      console.error("❌ Error: SCREENSHOT_URL is not set.");
      console.error("   Please add your app domain to your .env file.");
      console.error("   Example: SCREENSHOT_URL=your-domain.ngrok.app");
      process.exit(1);
    }

    // Check for browserless API URL
    if (!SCREENSHOT_CONFIG.baseUrl) {
      console.error("❌ Error: BROWSERLESS_API_URL is not set.");
      console.error(
        "   Please add your browserless API URL to your .env file.",
      );
      process.exit(1);
    }

    console.log("📸 Screenshot Generator with Resizing for Farcaster Mini Apps");
    console.log(`🌐 Taking screenshots of: ${appDomain}`);

    console.log("\n🎯 Generating screenshots and resized versions...");
    console.log("   📱 Original: Screenshot (768x512px viewport)");
    console.log(`   🖼️  Icon: Resized to ${ICON_DIMENSIONS.width}x${ICON_DIMENSIONS.height}px`);
    console.log(`   🚀 Splash: Resized to ${SPLASH_DIMENSIONS.width}x${SPLASH_DIMENSIONS.height}px`);

    // Clear existing screenshots
    clearExistingScreenshots();

    console.log(`\n📝 Generation Parameters:`);
    console.log("=".repeat(50));
    console.log(`🔗 Screenshot URL: ${appDomain}`);
    console.log(
      `🖼️  Original: ${SCREENSHOT_VIEWPORTS.embed.width}x${SCREENSHOT_VIEWPORTS.embed.height}px (Screenshot)`,
    );
    console.log(`🎯 Icon: ${ICON_DIMENSIONS.width}x${ICON_DIMENSIONS.height}px (Resized)`);
    console.log(`🚀 Splash: ${SPLASH_DIMENSIONS.width}x${SPLASH_DIMENSIONS.height}px (Resized)`);
    console.log("=".repeat(50));

    console.log("\n⏳ Generating images with retry logic...");
    const overallStartTime = Date.now();

    // Generate screenshots with retry logic (3 attempts, 5-second delay)
    const embedResult = await generateScreenshotWithRetryAndResize(
      appDomain,
      SCREENSHOT_VIEWPORTS.embed,
      "embed",
    );

    const overallEndTime = Date.now();
    const totalDuration = ((overallEndTime - overallStartTime) / 1000).toFixed(
      1,
    );

    // Print final results
    if (embedResult.success) {
      // Successful - update config and show success
      updateFarcasterConfigWithImages(
        process.env.NEXT_PUBLIC_APP_DOMAIN,
        embedResult.result.icon,
        embedResult.result.splash,
      );

      console.log("\n🎉 Screenshot generation with resizing complete!");
      console.log(`   📁 Original: public/images/${embedResult.result.original}`);
      console.log(`   📁 Icon: public/images/${embedResult.result.icon}`);
      console.log(`   📁 Splash: public/images/${embedResult.result.splash}`);
      console.log(`   ⏱️  Total time: ${totalDuration}s`);
      console.log("   ✅ Updated: public/.well-known/farcaster.json");
    } else {
      // Complete failure
      console.log("\n💥 Screenshot generation failed completely!");
      console.log(`   ⏱️  Total time: ${totalDuration}s`);
      console.log("\n📋 Complete failure summary:");
      embedResult.failures.forEach((failure) => {
        console.log(
          `   ❌ ${failure.type} (${failure.viewport}) attempt ${failure.attempt} at ${failure.timestamp}:`,
        );
        console.log(`      ${failure.error}`);
      });

      throw new Error(
        "All screenshot generation attempts failed. See detailed logs above.",
      );
    }
  } catch (error) {
    console.error("\n❌ Error generating screenshots:");
    console.error("💥", error.message);
    process.exit(1);
  }
}

// Run the script when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateScreenshots().catch(console.error);
}

export {
  generateScreenshotWithResize,
  generateScreenshotWithRetryAndResize,
  takeScreenshot,
  clearExistingScreenshots,
  updateFarcasterConfigWithImages,
  generateScreenshots,
  resizeAndSaveImage,
};
