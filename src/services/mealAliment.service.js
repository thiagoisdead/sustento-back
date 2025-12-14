import { prisma } from "../config/prisma.js";
import { createLog } from "./log.service.js";

// Função adaptada e corrigida
export async function createMealAliment(data) {
    // 1. Log inicial (mantido)
    await createLog({
        message: "A MEAL ALIMENT WAS SUCCESSFULLY CREATED",
        entity_type: "MEAL ALIMENT",
        action: "CREATE"
    });

    // 2. Desestruturação e Mapeamento dos Dados
    const { alimentData, ...mealAlimentData } = data;
    
    if (!alimentData) {
        // Assume que o ID interno do alimento (aliment_id) já foi fornecido em mealAlimentData
        if (!mealAlimentData.aliment_id) {
            throw new Error("Missing required field: alimentData or aliment_id.");
        }
        
        // Pula toda a lógica de busca/criação e vai direto para a criação do vínculo.
        return await prisma.mealAliments.create({
            data: mealAlimentData,
        });
    }

    const inputId = alimentData.id;

    if (!alimentData.nutrients) {
        throw new Error("Missing required field: nutrients in alimentData.");
    }

    const { nutrients, ...restOfAlimentData } = alimentData;
    const mappedNutrients = {
        calories_100g: nutrients.calories_100g,
        protein_100g: nutrients.proteins_100g,
        carbs_100g: nutrients.carbs_100g,
        fat_100g: nutrients.fat_100g,
        saturated_fat_100g: nutrients.saturatedFat_100g,
        fiber_100g: nutrients.fiber_100g,
        sugar_100g: nutrients.sugar_100g,
        sodium_100g: nutrients.sodium_100g,
    };

    const finalAlimentData = {
        ...restOfAlimentData,
        ...mappedNutrients,
    };
    
    let existingAliment = null;
    const MAX_INT_SIZE = 2147483647; 
    const isSafeInt = Number(inputId) <= MAX_INT_SIZE;

    if (isSafeInt) {
        existingAliment = await prisma.aliments.findFirst({
            where: {
                OR: [
                    { aliment_id: Number(inputId) },
                    { external_id: String(inputId) }
                ]
            }
        });
    } else {
        existingAliment = await prisma.aliments.findFirst({
            where: {
                external_id: String(inputId)
            }
        });
    }

    // ID FINAL QUE SERÁ USADO NO VÍNCULO
    let finalAlimentId;

    if (existingAliment) {
        // CASO 1: Encontrou (seja por ID interno ou externo)
        finalAlimentId = existingAliment.aliment_id;
    } else {
        // CASO 2: Não encontrou -> Cria novo
        finalAlimentData.external_id = String(inputId);
        
        // Remove 'id' do input antes de criar, pois não existe na tabela Aliments.
        delete finalAlimentData.id; 

        const newAliment = await prisma.aliments.create({
            data: finalAlimentData
        });
        finalAlimentId = newAliment.aliment_id;
    }

    // 🎯 CRIAÇÃO DO VÍNCULO (MealAliments) - CORRIGIDO para usar o finalAlimentId
    // OBS: Implementação de 'upsert' recomendada em interações anteriores não está aqui,
    // mas corrigi o bloco para pelo menos usar o ID correto.
    return await prisma.mealAliments.create({
        data: {
            ...mealAlimentData,
            aliment_id: finalAlimentId, // ⬅️ Usa o ID interno garantido
        },
    });
}

export async function listMealAliments() {
  return await prisma.mealAliments.findMany();
}

export async function getMealAliment(id) {
  return await prisma.mealAliments.findUnique({
    where: { meal_aliment_id: Number(id) },
  });
}

export async function updateMealAliment(id, data) {
  await createLog({
        message: "A MEAL ALIMENT WAS SUCCESSFULLY UPDATED",
        entity_id: Number(id),
        entity_type: "MEAL ALIMENT",
        action: "UPDATE"
      });
  return await prisma.mealAliments.update({
    where: { meal_aliment_id: Number(id) },
    data,
  });
}

export async function deleteMealAliment(id) {
  await createLog({
        message: "A MEAL ALIMENT WAS SUCCESSFULLY DELETED",
        entity_id: Number(id),
        entity_type: "MEAL ALIMENT",
        action: "DELETE"
      });
  return await prisma.mealAliments.delete({
    where: { meal_aliment_id: Number(id) },
  });
}
