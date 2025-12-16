import { prisma } from "../config/prisma.js";
import { convertDayToDatetime } from "../utils/convertDayToDatetime.js";
import { convertHoursToDatetime } from "../utils/convertHoursToDatetime.js";
import { createLog } from "./log.service.js";

export async function createMealRecord(data) {
  const meal_moment = data.meal_moment ? convertHoursToDatetime(data.meal_moment) : null;
  const meal_date = data.meal_date ? convertDayToDatetime(data.meal_date) : null;
  await createLog({
        message: "A MEAL RECORD WAS SUCCESSFULLY CREATED",
        action: "CREATE"
      });
  
  return await prisma.mealRecords.create({
    data: {
      ...data,
      meal_moment,
      meal_date
    },
  });
}

export async function listMealRecords() {
  return await prisma.mealRecords.findMany();
}

export async function getMealRecord(id) {
  return await prisma.mealRecords.findUnique({
    where: { record_id: Number(id) },
  });
}

export async function updateMealRecord(id, data) {
  const meal_moment = data.meal_moment ? convertTime(data.meal_moment) : undefined;
  await createLog({
        message: "A MEAL RECORD WAS SUCCESSFULLY UPDATED",
        entity_id: Number(id),
        entity_type: "MEAL RECORD",
        action: "UPDATE"
      });
    return await prisma.mealRecords.update({
        where: { record_id: Number(id) },
        data: {
          ...data,
          ...(meal_moment && { meal_moment }),
        },
    });
}

export async function deleteMealRecord(id) {
  await createLog({
        message: "A MEAL RECORD WAS SUCCESSFULLY DELETED",
        entity_id: Number(id),
        entity_type: "MEAL RECORD",
        action: "DELETE"
      });
  return await prisma.mealRecords.delete({
    where: { record_id: Number(id) },
  });
}

export async function getMealRecordsByMealId(mealId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  return await prisma.mealRecords.findMany({
    where: {
      meal_id: Number(mealId), 
      created_at: {            
        gte: startOfDay,       
        lte: endOfDay,         
      },
    },
    orderBy: {
      created_at: 'desc' 
    }
  });
}
