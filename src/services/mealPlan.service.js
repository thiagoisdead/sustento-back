import { prisma } from "../config/prisma.js";
import * as aiService from "../services/openai.service.js";
import { createMeal } from "./meal.service.js";
import { createMealAliment } from "./mealAliment.service.js"
import { createLog } from "./log.service.js";

export async function createMealPlan(data) {
  const { target_calories, target_protein, target_fat, target_carbs } =
    await calculateTargetNutrients(data.user_id);

  const mealPlan = await prisma.mealPlans.create({
    data: {
      ...data,
      target_calories,
      target_protein,
      target_fat,
      target_carbs,
    },
  });

  await createLog({
        message: "A MEAL PLAN WAS SUCCESSFULLY CREATED",
        action: "CREATE",
        entity_type: "MEAL_PLAN",
        entity_id: mealPlan.plan_id
      });

  return mealPlan;
}

export async function suggestMealPlan(data) {
  const userMeasurements = await prisma.users.findUnique({
    where: { user_id: Number(data.user_id) },
    select: {
      name: true,
      weight: true,
      height: true,
      objective: true,
      activity_lvl: true,
      UserRestrictions: {
          select: {
              restriction: {
                  select: { restriction_name: true }
              }
          }
      }
    },
  });

  if (!userMeasurements) {
    throw new Error(`User with ID ${data.user_id} not found.`);
  }

  const restrictions = userMeasurements.UserRestrictions
    .map(ur => ur.restriction.restriction_name)
    .join(', ');

  const formattedRestrictions = restrictions || 'NONE';

  let mealPlanId = data.meal_plan_id ? Number(data.meal_plan_id) : null;
  let targetNutrients = {};
  let newPlanCreated = !data.meal_plan_id;

  if (!data.meal_plan_id) {
    let selfCreatedMealPlan = await createMealPlan({
      plan_name: data.plan_name ? data.plan_name : "Personalized Nutrition Plan",
      source: "AUTOMATIC",
      user_id: data.user_id,
    });
    mealPlanId = selfCreatedMealPlan.plan_id;
    targetNutrients = await calculateTargetNutrients(data.user_id);

  } else {
    mealPlanId = Number(data.meal_plan_id);

    const originalTargets = await calculateTargetNutrients(data.user_id);
    const currentPlanTotals = await calculatePlanTotals(mealPlanId);

    targetNutrients = {
      target_calories: Number(originalTargets.target_calories) - Number(currentPlanTotals.total_calories),
      target_protein: Number(originalTargets.target_protein) - Number(currentPlanTotals.total_protein),
      target_carbs: Number(originalTargets.target_carbs) - Number(currentPlanTotals.total_carbs),
      target_fat: Number(originalTargets.target_fat) - Number(currentPlanTotals.total_fat),
    };
    
    await prisma.mealAliments.deleteMany({ where: { meal: { plan_id: mealPlanId } } });
    await prisma.meals.deleteMany({ where: { plan_id: mealPlanId } });
  }

  const suggestedMeals = await aiService.generateDietSuggestion({
    ...userMeasurements,
    ...targetNutrients,
    restrictions: formattedRestrictions,
  });

 for (const [mealName, mealAliments] of Object.entries(suggestedMeals)) { // <--- CORREÇÃO AQUI
    const selfCreatedMeal = await createMeal({
        meal_name: mealName,
        meal_type: "FIXED",
        plan_id: Number(mealPlanId),
    });

    // Loop interno que itera sobre os alimentos da refeição (agora 'mealAliments' está definido)
    for (const [_, alimentData] of Object.entries(mealAliments)) {
        let alimentRecord = await prisma.aliments.findFirst({
            where: { name: alimentData.name },
            select: { aliment_id: true },
        });

        let finalAlimentId;

        if (alimentRecord) {
            finalAlimentId = alimentRecord.aliment_id;
        } else {
            try {
                // ATENÇÃO: É NECESSÁRIO MAPEAMENTO COMPLETO DOS CAMPOS (brand, nutrientes, etc)
                const newAliment = await prisma.aliments.create({
                    data: {
                        name: alimentData.name,
                        brand: alimentData.brand,
                        // Outros campos DE PROPRIEDADE do alimento devem ser mapeados aqui
                    }
                });
                finalAlimentId = newAliment.aliment_id;
                
                await createLog({ message: `New aliment created: ${alimentData.name}`, action: "CREATE", entity_type: "ALIMENT" });

            } catch (error) {
                console.error("Erro ao criar novo alimento:", error);
                continue;
            }
        }

        await createMealAliment({
            quantity: alimentData.quantity,
            measurement_unit: alimentData.measurement_unit.toUpperCase(),
            meal_id: selfCreatedMeal.meal_id,
            aliment_id: finalAlimentId,
        });
    }
}

  const finalPlanTotals = await calculatePlanTotals(mealPlanId);

  await prisma.mealPlans.update({
    where: { plan_id: Number(mealPlanId) },
    data: {
        target_calories: finalPlanTotals.total_calories, 
        target_protein: finalPlanTotals.total_protein,
        target_carbs: finalPlanTotals.total_carbs,
        target_fat: finalPlanTotals.total_fat,
    },
  });

  let fullMealPlanInfo = await prisma.mealPlans.findUnique({
    where: { plan_id: Number(mealPlanId) },
    select: {
      plan_id: true,
      plan_name: true,
      source: true,
      active: true,
      target_calories: true,
      target_protein: true,
      target_carbs: true,
      target_fat: true,
      user_id: true,
      created_at: true,
      
      Meals: {
        select: {
          meal_id: true,
          meal_name: true,
          meal_type: true,
          MealAliments: {
            select: {
              quantity: true,
              measurement_unit: true,
              meal_aliment_id: true,
              aliment: {
                select: {
                  aliment_id: true,
                  name: true,
                  brand: true,
                  image_url: true,
                },
              },
            },
          },
        },
      },
      user: {
          select: {
              user_id: true,
              name: true,
              email: true,
          }
      }
    },
  });

  await createLog({
        message: "THE USER REQUESTED AN AI GENERATED MEAL PLAN",
        entity_id: data.user_id,
        entity_type: "MEAL PLAN"
      });

  return fullMealPlanInfo;
}

export async function listMealPlans() {
  return await prisma.mealPlans.findMany();
}

export async function getMealPlan(id) {
  return await prisma.mealPlans.findUnique({
    where: { plan_id: Number(id) },
  });
}

export async function getMealsByPlanId(id) {
  return await prisma.meals.findMany({
    where: { 
      plan_id: Number(id) 
    },
  });
}

export async function updateMealPlan(id, data) {
  await createLog({
        message: "A MEAL PLAN WAS SUCCESSFULLY UPDATED",
        entity_id: Number(id),
        entity_type: "MEAL PLAN",
        action: "UPDATE"
      });
  return await prisma.mealPlans.update({
    where: { plan_id: Number(id) },
    data,
  });
}

export async function deleteMealPlan(id) {
  await createLog({
        message: "A MEAL PLAN WAS SUCCESSFULLY DELETED",
        entity_id: Number(id),
        entity_type: "MEAL PLAN",
        action: "DELETE"
      });
  return await prisma.mealPlans.delete({
    where: { plan_id: Number(id) },
  });
}

async function calculateTargetNutrients(userId) {
  const userRow = await prisma.users.findUnique({
    where: { user_id: Number(userId) },
    select: {
      gender: true,
      height: true,
      weight: true,
      age: true,
      activity_lvl: true,
    },
  });

  const { gender, height, weight, age, activity_lvl } = userRow;

  if (!gender || !height || !weight || !age || !activity_lvl) {
    throw new Error("The user has not all required info");
  }

  const baseFormula = 10 * weight + 6.25 * height - 5 * age;

  let target_calories = 0;
  switch (gender) {
    case "M":
      target_calories = baseFormula + 5;
      break;
    case "F":
      target_calories = baseFormula - 161;
      break;
    default:
      throw new Error("Gender not informed");
  }

  switch (activity_lvl) {
    case "SEDENTARY":
      target_calories *= 1.2;
      break;
    case "LIGHTLY_ACTIVE":
      target_calories *= 1.375;
      break;
    case "MODERATELY_ACTIVE":
      target_calories *= 1.55;
      break;
    case "ACTIVE":
      target_calories *= 1.725;
      break;
    case "VERY_ACTIVE":
      target_calories *= 1.9;
      break;
    default:
      throw new Error("Activity Level not informed");
  }

  target_calories = Math.floor(target_calories)

  let target_protein = Math.floor((target_calories * 0.2) / 4);
  let target_fat = Math.floor((target_calories * 0.3) / 9);
  let target_carbs = Math.floor((target_calories * 0.5) / 4);

  let total_calc = target_protein*4 + target_fat*9 + target_carbs*4;
  let diff = Math.round(target_calories - total_calc)

  target_carbs += diff

  const target_nutrients = {
    target_calories,
    target_protein,
    target_fat,
    target_carbs,
  };

  return target_nutrients;
}

export function convertToGrams(quantity, unit) {
    const qty = Number(quantity);
    if (isNaN(qty)) return 0;
    
    unit = unit.toUpperCase();

    switch (unit) {
        case 'G':
            return qty;
        case 'ML':
            return qty;
        case 'UN':
            return qty * 100;
        default:
            return qty;
    }
}

async function calculatePlanTotals(mealPlanId) {
    const planDetails = await prisma.mealPlans.findUnique({
        where: { plan_id: Number(mealPlanId) },
        include: {
            Meals: {
                include: {
                    MealAliments: {
                        select: {
                            quantity: true,
                            measurement_unit: true,
                            aliment: {
                                select: {
                                    calories_100g: true,
                                    protein_100g: true,
                                    carbs_100g: true,
                                    fat_100g: true,
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    if (!planDetails || !planDetails.Meals) {
        return {
            total_calories: 0,
            total_protein: 0,
            total_carbs: 0,
            total_fat: 0
        };
    }

    let total_calories = 0;
    let total_protein = 0;
    let total_carbs = 0;
    let total_fat = 0;

    for (const meal of planDetails.Meals) {
        for (const mealAliment of meal.MealAliments) {
            
            const item = mealAliment.aliment;
            const unit = mealAliment.measurement_unit;
            const quantity = mealAliment.quantity;

            const itemQuantityGrams = convertToGrams(quantity.toString(), unit);
            const scale = itemQuantityGrams / 100;

            if (item) {
                total_calories += (Number(item.calories_100g) || 0) * scale;
                total_protein += (Number(item.protein_100g) || 0) * scale;
                total_carbs += (Number(item.carbs_100g) || 0) * scale;
                total_fat += (Number(item.fat_100g) || 0) * scale;
            }
        }
    }

    return {
        total_calories: total_calories.toFixed(2),
        total_protein: total_protein.toFixed(2),
        total_carbs: total_carbs.toFixed(2),
        total_fat: total_fat.toFixed(2),
    };
}