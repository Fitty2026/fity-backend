# BE4 Gemini Outfit Image Generation

## Runtime selection

The outfit worker selects the AI boundary in this order:

1. `AI_OUTFIT_ADAPTER_URL` - existing external Fitty AI adapter
2. `GEMINI_API_KEY` - direct Gemini image generation
3. no provider - deterministic fallback image

Gemini uses `gemini-3.1-flash-image` by default. The model can be changed with `GEMINI_IMAGE_MODEL` without a code deployment.

## Input and output

- Up to three owned, active closet images are loaded from the private ImageAsset storage.
- Selected items are prioritized, then the closet snapshot supplies missing categories.
- Body profile attributes, style preferences, situation, date, and weather are included in the prompt.
- The output must be PNG, JPEG, or WebP and no larger than 20 MB.
- A valid output is stored as an `OUTFIT_RESULT` ImageAsset with `GENERATED` origin.
- Gemini rejection, timeout, malformed output, or storage failure is handled by the existing outfit fallback boundary.

The current contract does not preserve a user body reference image. Gemini therefore creates an anonymous virtual model visualization, not a virtual try-on of the authenticated user.

## Environment

```dotenv
GEMINI_API_KEY=replace-with-google-ai-studio-key
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
GEMINI_IMAGE_TIMEOUT_MS=120000
```

Never commit a real API key. Configure it only in the deployment secret store or local `.env`.
