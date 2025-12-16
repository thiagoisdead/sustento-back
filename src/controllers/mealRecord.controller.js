import * as MealRecordService from "../services/mealRecord.service.js"

export async function createMealRecord(req, res) {
  try {
    const mealRecord = await MealRecordService.createMealRecord(req.body);
    res.status(201).json(mealRecord);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function listMealRecords(req, res) {
  const mealRecord = await MealRecordService.listMealRecords();
  res.json(mealRecord);
}

export async function getMealRecord(req, res) {
  const mealRecord = await MealRecordService.getMealRecord(req.params.id);
  if (!mealRecord) return res.status(404).json({ error: "Meal record not found" });
  res.json(mealRecord);
}

export async function updateMealRecord(req, res) {
  try {
    const mealRecord = await MealRecordService.updateMealRecord(req.params.id, req.body);
    res.json(mealRecord);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function deleteMealRecord(req, res) {
  try {
    await MealRecordService.deleteMealRecord(req.params.id);
    res.status(204).send()
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getMealRecordsByMealId(req, res) {
  try {
    const mealId = req.params.id;
    const mealRecords = await MealRecordService.getMealRecordsByMealId(mealId);
    res.json(mealRecords);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

