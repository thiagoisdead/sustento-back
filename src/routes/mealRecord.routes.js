import { Router } from "express";
import {
  createMealRecord,
  listMealRecords,
  getMealRecord,
  updateMealRecord,
  deleteMealRecord,
  getMealRecordsByMealId
} from "../controllers/mealRecord.controller.js";

const router = Router();

router.post("/", createMealRecord);
router.get("/", listMealRecords);
router.get("/meal/:id", getMealRecordsByMealId);
router.get("/:id", getMealRecord);
router.put("/:id", updateMealRecord);
router.delete("/:id", deleteMealRecord);


export default router;
