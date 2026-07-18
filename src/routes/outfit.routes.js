import express from "express";
import * as outfitController from "../controllers/outfit.controller.js";
import { requireOutfitAuth } from "../middlewares/outfit-auth.middleware.js";

const router = express.Router();

router.use(requireOutfitAuth);
router.post("/generation-jobs", outfitController.createGenerationJob);
router.get("/generation-jobs/:jobId", outfitController.getGenerationJob);
router.post("/save", outfitController.saveOutfit);
router.get("/saved", outfitController.getSavedOutfits);
router.delete("/saved/:savedOutfitId", outfitController.deleteSavedOutfit);

export default router;
