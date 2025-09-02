#!/usr/bin/env node

import "dotenv/config";
import mime from "mime";
import sharp from "sharp";
import { spawn } from "child_process";
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
 * OpenRouter Icon Generation Script for Farcaster Mini Apps
 *
 * This script generates AI-powered icons using OpenRouter's Gemini API.
 * Environment variables are automatically loaded from .env file using dotenv.
 *
 * Usage:
 *   node scripts/generate-gemini-icon.js
 *   node scripts/generate-gemini-icon.js [prompt]
 */

// OpenRouter API configuration
const OPENROUTER_MODEL = "google/gemini-2.5-flash-image-preview:free";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

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

// Retry configuration
const MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 60; // Default 60 seconds if no retryDelay specified

/**
 * Generate timestamp-based filename
 * @param {string} type - The image type (icon)
 * @param {string} prefix - The filename prefix (gemini)
 * @returns {string} - The generated filename
 */
function generateFilename(type, prefix = "gemini") {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${type}-${timestamp}`;
}

/**
 * Resize image to specified dimensions using Sharp
 * @param {Buffer} imageBuffer - The image buffer to resize
 * @param {number} width - Target width
 * @param {number} height - Target height
 * @returns {Promise<Buffer>} - Resized image buffer
 */
async function resizeImage(imageBuffer, width, height) {
  try {
    const resizedBuffer = await sharp(imageBuffer)
      .resize(width, height, {
        fit: "cover",
        position: "center",
      })
      .png()
      .toBuffer();

    console.log(`🔧 Resized image to ${width}x${height}`);
    return resizedBuffer;
  } catch (error) {
    console.warn(`⚠️  Failed to resize image: ${error.message}`);
    return imageBuffer; // Return original if resize fails
  }
}

/**
 * Save binary file to filesystem
 * @param {string} fileName - The filename to save
 * @param {Buffer} content - The file content buffer
 * @returns {Promise<void>}
 */
function saveBinaryFile(fileName, content) {
  return new Promise((resolve, reject) => {
    try {
      writeFileSync(fileName, content);
      console.log(`💾 File ${fileName} saved to file system.`);
      resolve();
    } catch (err) {
      console.error(`❌ Error writing file ${fileName}:`, err);
      reject(err);
    }
  });
}

/**
 * Resize and save image to specified dimensions
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

    console.log(`💾 Saved resized image: ${filename}.png`);
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
 * Clears all existing icon and splash images from the public/images directory
 */
function clearExistingIcons() {
  const imagesDir = join(process.cwd(), "public/images");

  if (!existsSync(imagesDir)) {
    return;
  }

  const files = readdirSync(imagesDir);
  const iconFiles = files.filter(
    (file) => (file.startsWith("gemini-icon-") || file.startsWith("gemini-splash-")) && file.endsWith(".png"),
  );

  console.log("🗑️  Clearing existing icon and splash images...");
  iconFiles.forEach((file) => {
    const filePath = join(imagesDir, file);
    try {
      unlinkSync(filePath);
      console.log(`   Deleted: ${file}`);
    } catch (error) {
      console.warn(`   Failed to delete: ${file}`);
    }
  });
}

/**
 * Reads and parses the Farcaster configuration file to extract app name
 * @returns {string} - The app name from farcaster.json
 */
function getAppNameFromConfig() {
  try {
    const configPath = join(process.cwd(), "public/.well-known/farcaster.json");
    const configContent = readFileSync(configPath, "utf8");
    const config = JSON.parse(configContent);
    return config.miniapp?.name || "Mini App";
  } catch (error) {
    console.warn(
      "⚠️  Warning: Could not read app name from farcaster.json, using default",
    );
    return "Mini App";
  }
}

/**
 * Generate icon prompt based on app name
 * @param {string} appName - The app name
 * @returns {string} - The generated prompt
 */
function generateIconPrompt(appName) {
  return `Create a clean, minimalist square app icon for "${appName}". The icon should be:
- Modern and professional design
- 1:1 aspect ratio (square format)
- High contrast colors that work well at small sizes
- Simple, geometric shapes or clean typography
- Suitable for a mobile app icon
- No complex details that become unclear when scaled down
- Colors should NOT be primarily purple - prefer blue, teal, green, or neutral colors
- If text is included, make it bold and highly readable
Generate a PNG image that would work perfectly as a Farcaster mini app icon.`;
}

/**
 * Updates the farcaster.json file with the generated icon URL
 * @param {string} iconFilename - The icon filename
 */
function updateFarcasterConfigWithIcon(iconFilename) {
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

    // Get domain from existing config or environment
    const domain = config.miniapp?.homeUrl
      ? new URL(config.miniapp.homeUrl).origin
      : `https://${process.env.NEXT_PUBLIC_APP_DOMAIN}`;

    // Update icon URL
    if (config.miniapp && iconFilename) {
      config.miniapp.iconUrl = `${domain}/images/${iconFilename}`;
    }

    // Write updated config
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("✅ Updated farcaster.json with new icon URL");
  } catch (error) {
    console.error("❌ Error updating farcaster.json:", error.message);
  }
}

/**
 * Updates the farcaster.json file with both icon and splash image URLs
 * @param {string} iconFilename - The icon filename
 * @param {string} splashFilename - The splash filename
 */
function updateFarcasterConfigWithImages(iconFilename, splashFilename) {
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

    // Get domain from existing config or environment
    const domain = config.miniapp?.homeUrl
      ? new URL(config.miniapp.homeUrl).origin
      : `https://${process.env.NEXT_PUBLIC_APP_DOMAIN}`;

    // Update icon and splash URLs
    if (config.miniapp) {
      if (iconFilename) {
        config.miniapp.iconUrl = `${domain}/images/${iconFilename}`;
      }
      if (splashFilename) {
        config.miniapp.imageUrl = `${domain}/images/${splashFilename}`;
      }
    }

    // Write updated config
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("✅ Updated farcaster.json with new icon and splash URLs");
  } catch (error) {
    console.error("❌ Error updating farcaster.json:", error.message);
  }
}

/**
 * Parse retry delay from Gemini API error response
 * @param {Error} error - The error object
 * @returns {number} - Delay in seconds
 */
function parseRetryDelay(error) {
  try {
    const errorMessage = error.message || "";
    console.log(`🔍 Parsing error message for retryDelay...`);

    // Handle nested JSON structure in Gemini API errors
    // The error structure is: error.message contains a JSON string with error.details[]

    // First, try to parse the entire error message as JSON
    let outerError = null;
    try {
      outerError = JSON.parse(errorMessage);
    } catch (parseError) {
      // If that fails, try to extract JSON from the message
      const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        outerError = JSON.parse(jsonMatch[0]);
      }
    }

    if (outerError?.error?.message) {
      // The actual error details are in a nested JSON string
      let innerErrorStr = outerError.error.message;

      // Clean up the JSON string (remove escaped newlines and quotes)
      innerErrorStr = innerErrorStr.replace(/\\n/g, "").replace(/\\/g, "");

      try {
        const innerError = JSON.parse(innerErrorStr);

        // Look for RetryInfo in the details array
        if (innerError.error?.details) {
          for (const detail of innerError.error.details) {
            if (
              detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo" &&
              detail.retryDelay
            ) {
              const delayStr = detail.retryDelay;
              const seconds = parseInt(delayStr.replace("s", ""), 10);
              console.log(`📋 Found RetryInfo with retryDelay: ${seconds}s`);
              return seconds;
            }
          }
        }
      } catch (innerParseError) {
        console.warn(
          `⚠️  Could not parse inner JSON: ${innerParseError.message}`,
        );
      }
    }

    // Fallback: try regex pattern matching for retryDelay
    const retryDelayMatch = errorMessage.match(
      /retryDelay[\"']\s*:\s*[\"'](\d+)s[\"']/,
    );
    if (retryDelayMatch) {
      const delaySeconds = parseInt(retryDelayMatch[1], 10);
      console.log(`📋 Found retryDelay via regex: ${delaySeconds}s`);
      return delaySeconds;
    }
  } catch (parseError) {
    console.warn(`⚠️  Error parsing retryDelay: ${parseError.message}`);
  }

  console.log(`📋 Using default retry delay: ${DEFAULT_RETRY_DELAY}s`);
  return DEFAULT_RETRY_DELAY;
}

/**
 * Parse and log quota violation details from Gemini API error
 * @param {Error} error - The error object
 */
function logQuotaViolations(error) {
  try {
    const errorMessage = error.message || "";
    let outerError = null;

    try {
      outerError = JSON.parse(errorMessage);
    } catch (parseError) {
      const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        outerError = JSON.parse(jsonMatch[0]);
      }
    }

    if (outerError?.error?.message) {
      let innerErrorStr = outerError.error.message;
      innerErrorStr = innerErrorStr.replace(/\\n/g, "").replace(/\\/g, "");

      try {
        const innerError = JSON.parse(innerErrorStr);

        if (innerError.error?.details) {
          for (const detail of innerError.error.details) {
            if (
              detail["@type"] ===
                "type.googleapis.com/google.rpc.QuotaFailure" &&
              detail.violations
            ) {
              console.log("📊 Quota violations detected:");
              detail.violations.forEach((violation, index) => {
                console.log(`   ${index + 1}. ${violation.quotaId}`);
                if (violation.quotaMetric) {
                  console.log(`      Metric: ${violation.quotaMetric}`);
                }
                if (violation.quotaDimensions?.model) {
                  console.log(
                    `      Model: ${violation.quotaDimensions.model}`,
                  );
                }
              });
            }
          }
        }
      } catch (innerParseError) {
        // Ignore parsing errors for quota details
      }
    }
  } catch (parseError) {
    // Ignore parsing errors for quota details
  }
}

/**
 * Sleep for specified number of seconds
 * @param {number} seconds - Number of seconds to sleep
 * @returns {Promise<void>}
 */
function sleep(seconds) {
  return new Promise((resolve) => {
    console.log(`⏱️  Waiting ${seconds}s before retry...`);

    // Show countdown for longer waits
    if (seconds > 10) {
      let remaining = seconds;
      const interval = setInterval(() => {
        remaining -= 10;
        if (remaining > 0) {
          console.log(`⏱️  ${remaining}s remaining...`);
        } else {
          clearInterval(interval);
        }
      }, 10000);
    }

    setTimeout(() => resolve(), seconds * 1000);
  });
}


/**
 * Generate icon using OpenRouter API with retry logic
 * @param {string} prompt - The image generation prompt
 * @param {number} retryCount - Current retry attempt (default: 0)
 * @returns {Promise<Object>} - The generation result with filename
 */
async function generateIcon(prompt, retryCount = 0) {
  const startTime = Date.now();
  const isRetry = retryCount > 0;

  if (isRetry) {
    console.log(
      `\n🔄 Retry attempt ${retryCount}/${MAX_RETRIES} - Generating icon image with OpenRouter...`,
    );
  } else {
    console.log(`\n🎨 Generating icon image with OpenRouter...`);
  }
  console.log(`📝 Prompt: ${prompt}`);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        modalities: ["image"],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    // Ensure images directory exists
    const imagesDir = join(process.cwd(), "public/images");
    if (!existsSync(imagesDir)) {
      mkdirSync(imagesDir, { recursive: true });
    }

    let savedFiles = [];

    // Process the response - OpenRouter returns images in message.images array
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const message = data.choices[0].message;

      // Check if there are images in the response
      if (message.images && Array.isArray(message.images)) {
        for (let i = 0; i < message.images.length; i++) {
          const image = message.images[i];
          if (image.image_url && image.image_url.url) {
            // Handle base64 data URL
            const imageUrl = image.image_url.url;

            if (imageUrl.startsWith("data:image/")) {
              // Extract base64 data from data URL
              const base64Data = imageUrl.split(",")[1];
              const buffer = Buffer.from(base64Data, "base64");

              // Resize image to optimal dimensions
              const resizedBuffer = await resizeImage(
                buffer,
                ICON_DIMENSIONS.width,
                ICON_DIMENSIONS.height,
              );

              const fileName = generateFilename("icon", "gemini") + `_${i}`;
              const fullFileName = `${fileName}.png`;
              const filePath = join(imagesDir, fullFileName);

              await saveBinaryFile(filePath, resizedBuffer);
              savedFiles.push({ filename: fullFileName, filePath, buffer: resizedBuffer });
            }
          }
        }
      }
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);

    if (savedFiles.length > 0) {
      console.log(
        `✅ Generated ${savedFiles.length} icon image(s) in ${duration}s`,
      );
      return savedFiles[0]; // Return the first generated image
    } else {
      throw new Error("No images were generated");
    }
  } catch (error) {
    // Check if it's a 429 rate limit error
    const is429Error =
      error.message.includes("429") ||
      error.message.includes("Too Many Requests") ||
      error.message.includes("rate limit");

    if (is429Error && retryCount < MAX_RETRIES) {
      console.warn(
        `⚠️  Rate limit hit (429) - attempt ${retryCount + 1}/${MAX_RETRIES}`,
      );

      // Parse retry delay from error message
      const retryDelay = parseRetryDelay(error);

      // Wait for the specified delay
      await sleep(retryDelay);

      // Retry the request
      return generateIcon(prompt, retryCount + 1);
    }

    // If not a retryable error or max retries exceeded
    if (is429Error && retryCount >= MAX_RETRIES) {
      console.error(
        `❌ Max retries (${MAX_RETRIES}) exceeded for rate limiting`,
      );
    }

    console.error(`❌ Failed to generate icon image:`, error.message);
    throw error;
  }
}


/**
 * Main function to generate Gemini icon
 */
async function main() {
  try {
    // Validate API key
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error("❌ Error: OPENROUTER_API_KEY is not set.");
      console.error("   Please add your OpenRouter API key to your .env file.");
      console.error("   Get your API key from: https://openrouter.ai/keys");
      process.exit(1);
    }

    // Get app name and generate prompt
    const appName = getAppNameFromConfig();
    const customPrompt = process.argv[2]; // Allow custom prompt as argument
    const prompt = customPrompt || generateIconPrompt(appName);

    console.log("🎨 OpenRouter Icon Generator for Farcaster Mini Apps");
    console.log(`📱 App: ${appName}`);
    console.log(`🤖 Model: ${OPENROUTER_MODEL}`);
    console.log(
      `🖼️  Icon: ${ICON_DIMENSIONS.width}x${ICON_DIMENSIONS.height}px`,
    );
    console.log(
      `🚀 Splash: ${SPLASH_DIMENSIONS.width}x${SPLASH_DIMENSIONS.height}px (resized from icon)`,
    );

    // Clear existing icons
    clearExistingIcons();

    console.log("\n🚀 Initializing OpenRouter API...");

    // Generate icon
    const iconResult = await generateIcon(prompt);

    // Resize icon for splash
    console.log(
      `\n🔄 Resizing icon to splash dimensions: ${SPLASH_DIMENSIONS.width}x${SPLASH_DIMENSIONS.height}px`,
    );
    const splashFilename = generateFilename("splash", "gemini");
    const splashResult = await resizeAndSaveImage(
      iconResult.buffer,
      splashFilename,
      SPLASH_DIMENSIONS,
    );

    // Update farcaster.json with new images
    updateFarcasterConfigWithImages(iconResult.filename, splashResult.filename);

    console.log("\n🎉 Image generation complete!");
    console.log(`   📁 Icon: public/images/${iconResult.filename}`);
    console.log(`   📁 Splash: public/images/${splashResult.filename}`);
    console.log("   ✅ Updated: public/.well-known/farcaster.json");
  } catch (error) {
    console.error("\n❌ Error generating icon:");
    console.error("💥", error.message);

    if (error.message.includes("429") || error.message.includes("rate limit")) {
      console.error(
        "⏰ Rate Limit: Maximum retries exceeded - please try again later",
      );
    }

    process.exit(1);
  }
}

// Run the script when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  generateIcon,
  generateIconPrompt,
  getAppNameFromConfig,
  clearExistingIcons,
  updateFarcasterConfigWithIcon,
};
