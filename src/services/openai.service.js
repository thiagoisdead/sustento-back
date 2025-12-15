import { openai } from "../config/openai.js";
import * as searchOrchestrator from '../services/combinedAliment.service.js';

function calculatePlanTotalsSimulated(plan, availableFoods) {
    const macroData = {};
    
    availableFoods.forEach(foodString => {
        const nameMatch = foodString.match(/^(.+?)\s*\((.+?)\)$/);
        if (nameMatch) {
            const name = nameMatch[1].trim();
            const details = nameMatch[2];
            const calMatch = details.match(/Cal:\s*([\d.]+)/);
            const protMatch = details.match(/Prot:\s*([\d.]+)/);

            macroData[name] = {
                cal: parseFloat(calMatch[1]),
                prot: parseFloat(protMatch[1])
            };
        }
    });

    let total_calories = 0;
    let total_protein = 0;
    
    for (const mealKey in plan) {
        const meal = plan[mealKey];
        if (typeof meal === 'object' && meal !== null) {
            for (const itemKey in meal) {
                const item = meal[itemKey];
                
                if (item && item.name && item.quantity) {
                    const foodName = item.name.trim();
                    const quantity = Number(item.quantity);
                    const unit = item.measurement_unit ? item.measurement_unit.toUpperCase() : 'G';

                    if (macroData[foodName] && quantity > 0) {
                        let quantityGrams = quantity;

                        if (unit === 'UN') {
                            quantityGrams = quantity * 100;
                        } else if (unit === 'KG') {
                            quantityGrams = quantity * 1000;
                        }

                        const scale = quantityGrams / 100;

                        total_calories += macroData[foodName].cal * scale;
                        total_protein += macroData[foodName].prot * scale;
                    }
                }
            }
        }
    }
    return { total_calories, total_protein };
}

function getFoodRestrictions(product) {
    const violations = [];
    if (!product || !product.dietaryInfo) return violations;
    
    const info = product.dietaryInfo;

    const veganStatus = info.vegan?.status;
    const vegetarianStatus = info.vegetarian?.status;
    
    if (veganStatus === 'Não Vegano' || info.allergens?.includes('Leite') || info.allergens?.includes('Ovos')) {
         violations.push('NOT_VEGAN');
    }
    
    if (vegetarianStatus === 'Não Vegetariano') {
        violations.push('NOT_VEGETARIAN');
    }

    const glutenStatus = info.status_gluten;
    if (glutenStatus && (glutenStatus.includes('Contém Glúten') || glutenStatus.includes('Pode Conter Glúten'))) {
        violations.push('CONTAINS_GLUTEN');
    }

    if (info.allergens && info.allergens.includes('Leite')) {
        violations.push('CONTAINS_LACTOSE');
    }

    return violations;
}

const densityInstruction = (objective) => {
    switch (objective) {
        case 'GAIN_MUSCLE':
            return 'CRITICAL INSTRUCTION: Since the goal is GAIN_MUSCLE, you MUST prioritize suggesting foods that are CALORIE-DENSER, HIGH IN PROTEIN, and/or RICH IN HEALTHY FATS to facilitate meeting the macro targets.';
        case 'LOSE_WEIGHT':
            return 'CRITICAL INSTRUCTION: Since the goal is LOSE_WEIGHT, you MUST prioritize suggesting foods that are HIGH IN VOLUME, HIGH IN FIBER, and/or LOW IN CALORIE-DENSITY (like lean protein and vegetables) to ensure satiety.';
        case 'MAINTENANCE':
        default:
            return 'CRITICAL INSTRUCTION: Since the goal is MAINTENANCE, suggest a wide variety of nutrient-dense, whole foods to ensure a balanced diet.';
    }
};

const tools = [];


export async function generateDietSuggestion(userData) {
    const { name, weight, height, objective, activity_lvl, target_calories, target_protein, target_carbs, target_fat, restrictions } = userData;

    const densityInstructionResult = densityInstruction(objective);

    const restrictionStringPrompt = `**CRITICAL RESTRICTION:** The user has the following dietary restrictions: [${restrictions}]. You MUST NOT include any food that violates these restrictions in the final plan.`
    
    const isVeganOrVegetarian = restrictions.includes('VEGAN') || restrictions.includes('VEGETARIAN');

    const cohesionProtocol = `
        **COHESION & CULTURAL CONTEXT PROTOCOL (CRITICAL):**
        You MUST structure the ingredients within each meal to form a coherent, palatable dish, not just a list of macros.

        1.  **BREAKFAST:** Must include a primary Carbohydrate (Pão or Aveia) and a high-quality Protein source (Ovos, Queijo, or Iogurte).
        
        2.  **LUNCH/DINNER (BRAZILIAN STAPLE):** Must strictly adhere to the following 4-part structure:
            * REQUIRED BASE CARBOHYDRATE: Must include a PRIMARY STARCH (e.g., Arroz, Macarrão, Batata Doce).
            * REQUIRED BASE LEGUME: Must include **Feijão** or Lentilha/Grão-de-Bico.
            * REQUIRED PRIMARY ANIMAL PROTEIN: Must include **ONE** item from Peito de Frango, Carne Bovina, or Peixe.
            * VEGETABLE/FIBER: At least one vegetable or salad source.

        3.  **SNACKS:** Must focus on convenience (e.g., Castanhas, Frutas, Iogurte).
        4.  **MACRO ADJUSTMENT:** Use the largest possible quantities of PRIMARY CARBOHYDRATES to meet the high caloric goal (${target_calories} kcal).
    `;

    const mandatoryInstruction = isVeganOrVegetarian
    ? `**MANDATORY FOODS (VEGAN/VEGETARIAN):** The generated list MUST prioritize plant-based staples: Tofu, Grão-de-bico, Lentilha, Feijão preto, Pasta de Amendoim, Arroz integral, Batata Doce. You MUST completely ignore any instruction regarding animal protein.`
    : `**MANDATORY FOODS (OMNIVORE):** The generated list MUST include staple proteins: Peito de Frango, Carne Bovina, Salmão, Ovos, Arroz integral, Feijão preto, Batata Doce.`;

    const conceptPrompt = `
        You are a professional nutritionist. Based on the user's data and macro goals (Cal: ${target_calories}, Prot: ${target_protein}g, Carbs: ${target_carbs}g, Fat: ${target_fat}g), suggest a list of 10 essential, common, and healthy food names (in Portuguese) that would form the basis of this diet. 
        
        **CRITICAL NAMING RULE (SEARCH OPTIMIZATION):** Names MUST be simple, short, and use NO parentheses, no complex descriptions, and NO synonyms. Use only single, direct search terms (e.g., 'Peito de Frango', 'Salmão', 'Ovo', 'Arroz integral', 'Feijão').

        ${cohesionProtocol}

        ${mandatoryInstruction}

        ${restrictions ? restrictionStringPrompt : ''}

        ${densityInstructionResult}
        
        Output only a JSON array of strings, without any other text.
    `;

    const conceptCompletion = await openai.chat.completions.create({
        model: "gpt-4-turbo", 
        messages: [
            { role: "system", content: "You are a professional nutrition expert. Your only task is to generate JSON output." },
            { role: "user", content: conceptPrompt },
        ],
        temperature: 0.8, 
        max_tokens: 600,
        response_format: { type: "json_object" },
    });
    
    const rawConcepts = JSON.parse(conceptCompletion.choices[0].message.content); 
    const conceptArray = rawConcepts && rawConcepts.foods ? rawConcepts.foods : [];
    const foodNamesToSearch = conceptArray.filter(c => typeof c === 'string');

    if (foodNamesToSearch.length === 0) {
        throw new Error("Could not find any suitable foods in the database or external API to generate the diet plan.");
    }

    const userRestrictionsArray = restrictions.split(',').map(r => r.trim());

    let availableFoodsFinal = [];
    
    for (const concept of foodNamesToSearch) {
        const result = await searchOrchestrator.searchCombined({ query: concept, maxResults: 10 });
        
        if (result && result.products && result.products.length > 0) {
            const product = result.products[0];
            const macros = product.nutrients;

            const foodVetos = getFoodRestrictions(product);

            const isUltraprocessed = product.novaGroup >= 4;
            const hasTooManyWarnings = product.anvisaWarnings && product.anvisaWarnings.length >= 3;
            
            if (isUltraprocessed || hasTooManyWarnings){
                continue;
            };

            let violatesRestriction = false;
            
            if (userRestrictionsArray.includes('GLUTEN_FREE') && foodVetos.includes('CONTAINS_GLUTEN')) {
                violatesRestriction = true;
            }

            if (userRestrictionsArray.includes('LACTOSE_FREE') && foodVetos.includes('CONTAINS_LACTOSE')) {
                violatesRestriction = true;
            }

            if (userRestrictionsArray.includes('VEGAN') && foodVetos.includes('NOT_VEGAN')) {
                violatesRestriction = true;
            }
            
            if (userRestrictionsArray.includes('VEGETARIAN') && foodVetos.includes('NOT_VEGETARIAN')) {
                violatesRestriction = true;
            }
            
            //Restriction validation flag
            if (violatesRestriction) {
                continue;
            }
            
            const cal = Number(macros.calories_100g) || 0;
            const prot = Number(macros.protein_100g) || 0;
            const carb = Number(macros.carbs_100g) || 0;
            const fat = Number(macros.fat_100g) || 0;

            if (cal > 0 && prot > 0) {
                 availableFoodsFinal.push(
                    `${product.name} (Cal: ${cal.toFixed(1)}, Prot: ${prot.toFixed(1)}, Carb: ${carb.toFixed(1)}, Fat: ${fat.toFixed(1)})`
                );
            }
        }
    }
    
    const availableFoodsString = availableFoodsFinal.join('; ');

    if (availableFoodsFinal.length === 0) {
        throw new Error("Could not find any suitable foods in the database or external API to generate the diet plan.");
    }
    
    let finalDietObject = {};
    let currentPlan = { calories: 0, protein: 0, plan: {} };

    for (let attempt = 1; attempt <= 3; attempt++) {
        const remainingCal = Math.max(0, target_calories - currentPlan.calories);
        const remainingProt = Math.max(0, target_protein - currentPlan.protein);
        
        if (remainingCal <= target_calories * 0.10 && remainingProt <= target_protein * 0.10 && attempt > 1) {
            break;
        }

        const promptInstruction = attempt === 1 
            ? `Target Calories: ${target_calories} kcal | Target Protein: ${target_protein}g. **IMMEDIATE ACTION REQUIRED:** Using the macro data provided in the AVAILABLE FOODS list, calculate and generate the full diet plan that meets the targets and adheres to the STRICT OUTPUT PROTOCOL.`
            : `**CORRECTION ATTEMPT ${attempt}:** The current plan has a deficit of ${remainingCal.toFixed(0)} kcal and ${remainingProt.toFixed(0)}g of protein. Based on this deficit, GENERATE THE **ENTIRE, REVISED DIET PLAN** (breakfast, lunch, dinner, snacks) with increased quantities to close the gap. You MUST NOT generate keys like '_add1'. The previous incomplete plan was: ${JSON.stringify(currentPlan.plan)}`;
        
            const systemContent = `
            You are a professional nutritionist and a highly structured JSON generator. Your task is to output a perfect JSON object following the provided structure and rules.

            ${restrictions ? restrictionStringPrompt : ''}

            **INSTRUCTION:** Use the calorie and macro information provided in the AVAILABLE FOODS list to ensure the total suggested diet is within 10% of the target values. When generating the plan for the GAIN_MUSCLE objective, prioritize exceeding the target slightly rather than falling short.

            **STRICT OUTPUT PROTOCOL:**
            1.  **Structure:** The output MUST contain four keys ('breakfast', 'lunch', 'dinner', 'snacks'). Each of these keys MUST contain an **OBJECT**.
            2.  **Item Keys:** The nested object (e.g., 'breakfast') MUST use sequential keys starting from 'item1' (e.g., 'item1', 'item2', 'item3', etc.).
            3.  **Item Value (CRITICAL CHANGE):** The value of each 'itemN' key MUST be an object with exactly three keys: **"name"** (string), **"quantity"** (number), and **"measurement_unit"** (string).
            4.  **Unit Format (CRITICAL):** The "measurement_unit" value MUST be ONLY one of the following: **g, kg, ml, L, or un**. The "quantity" MUST be a numerical value.
                * **RULE ADDITION:** You MUST use **ML** for all liquids (like yogurt) and **UN** for countable items (like banana or slices of bread).
                * **Example of Conversion:** {"quantity": 2, "measurement_unit": "un"}.
            5.  **Food Source:** You MUST only use the exact names of ingredients listed in the 'AVAILABLE FOODS' section.
            6.  **Total Calories:** You MUST NOT include the "totalCalories" key.

            The required JSON format is:
            {
            "breakfast": { "item1": { "name": "Aveia, flocos, crua", "quantity": 100, "measurement_unit": "G" }, "item2": { "name": "Iogurte Natural Integral", "quantity": 200, "measurement_unit": "ML" } }, // 💡 Exemplo corrigido
            "lunch": { ... },
            "dinner": { ... },
            "snacks": { ... }
            }
        `;
        
        const finalPlanPrompt = `
            Generate a personalized diet suggestion for:
            - Goal: ${objective}
            - Target Calories: ${target_calories} kcal | Target Protein: ${target_protein}g
            ${restrictions ? `- Restrictions: [${restrictions}].` : ''}

            AVAILABLE FOODS (Name + Macro/100g): [${availableFoodsString}] 

            ${promptInstruction}

            Output a structured JSON. Return to me just the JSON, without any other info or it will break my code.
        `;

        try {
            const finalCompletion = await openai.chat.completions.create({
                model: "gpt-4-turbo", 
                messages: [
                     { role: "system", content: systemContent },
                     { role: "user", content: finalPlanPrompt },
                ],
                temperature: 0.2, 
                max_tokens: 3000,
                response_format: { type: "json_object" },
            });
            
            const newPlanSegment = JSON.parse(finalCompletion.choices[0].message.content);

            finalDietObject = newPlanSegment;

            const simulatedTotals = calculatePlanTotalsSimulated(finalDietObject, availableFoodsFinal);
            
            currentPlan.calories = simulatedTotals.total_calories;
            currentPlan.protein = simulatedTotals.total_protein;
            currentPlan.plan = finalDietObject;

        } catch (error) {
            console.error(`AI generation error on attempt ${attempt}:`, error);
        }
    }

    return finalDietObject;
}
