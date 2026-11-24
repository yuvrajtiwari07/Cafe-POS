import { InventoryItem, Recipe, InventoryMovement, OrderItem, InventoryUnit, MovementType } from '../types';
import { db, cleanData } from '../database';
import { doc, collection, setDoc, deleteDoc } from '../database';

const KEY_PREFIX_INVENTORY = 'billdedo_sb1_inventory_';
const KEY_PREFIX_RECIPES = 'billdedo_sb1_recipes_';
const KEY_PREFIX_MOVEMENTS = 'billdedo_sb1_movements_';

// 1. Conversion Matrix
// Normalizes quantities between metric sub-units (ml <-> L, g <-> kg, piece/packet)
export function convertUnits(
  qty: number,
  fromUnit: InventoryUnit,
  toUnit: InventoryUnit
): number | null {
  if (fromUnit === toUnit) return qty;

  // Volume conversions
  if (fromUnit === 'ml' && toUnit === 'L') return qty / 1000;
  if (fromUnit === 'L' && toUnit === 'ml') return qty * 1000;

  // Mass conversions
  if (fromUnit === 'g' && toUnit === 'kg') return qty / 1000;
  if (fromUnit === 'kg' && toUnit === 'g') return qty * 1000;

  // Direct piece / packet (cannot convert between discrete & continuous without density)
  return null;
}

// 2. Local Storage Handlers
export function getLocalInventory(cafeId: string): InventoryItem[] {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX_INVENTORY}${cafeId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalInventory(cafeId: string, items: InventoryItem[]): void {
  try {
    localStorage.setItem(`${KEY_PREFIX_INVENTORY}${cafeId}`, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('inventory_updated', { detail: { cafeId, items } }));
  } catch (e) {
    console.error('Error saving inventory locally', e);
  }
}

export function getLocalRecipes(cafeId: string): Record<string, Recipe> {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX_RECIPES}${cafeId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLocalRecipes(cafeId: string, recipes: Record<string, Recipe>): void {
  try {
    localStorage.setItem(`${KEY_PREFIX_RECIPES}${cafeId}`, JSON.stringify(recipes));
    window.dispatchEvent(new CustomEvent('recipes_updated', { detail: { cafeId, recipes } }));
  } catch (e) {
    console.error('Error saving recipes locally', e);
  }
}

export function getLocalMovements(cafeId: string): InventoryMovement[] {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX_MOVEMENTS}${cafeId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMovementLocally(cafeId: string, movement: InventoryMovement): void {
  try {
    const current = getLocalMovements(cafeId);
    const updated = [movement, ...current].slice(0, 500); // retain last 500 records
    localStorage.setItem(`${KEY_PREFIX_MOVEMENTS}${cafeId}`, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('movements_updated', { detail: { cafeId, movements: updated } }));
  } catch (e) {
    console.error('Error saving movement locally', e);
  }
}

// 3. Stock Availability Checker
// Returns missing ingredients if any stock is below required levels
export function checkStockAvailability(
  cafeId: string,
  items: OrderItem[]
): {
  isAvailable: boolean;
  shortages: { itemName: string; ingredientName: string; required: string; available: string }[];
} {
  const stockList = getLocalInventory(cafeId);
  const recipes = getLocalRecipes(cafeId);

  const stockMap: Record<string, InventoryItem> = {};
  stockList.forEach((s) => {
    stockMap[s.id] = { ...s };
  });

  const shortages: { itemName: string; ingredientName: string; required: string; available: string }[] = [];

  // Calculate aggregated consumption
  for (const orderItem of items) {
    const recipe = recipes[orderItem.menuItemId];
    if (!recipe || !recipe.components || recipe.components.length === 0) continue;

    for (const comp of recipe.components) {
      const invItem = stockMap[comp.inventoryItemId];
      if (!invItem) continue;

      const totalNeededUnit = comp.quantity * orderItem.quantity;
      const convertedQty = convertUnits(totalNeededUnit, comp.unit, invItem.unit);

      if (convertedQty !== null) {
        if (invItem.currentStock < convertedQty) {
          shortages.push({
            itemName: orderItem.name,
            ingredientName: invItem.name,
            required: `${totalNeededUnit} ${comp.unit}`,
            available: `${invItem.currentStock.toFixed(2)} ${invItem.unit}`,
          });
        } else {
          invItem.currentStock -= convertedQty;
        }
      }
    }
  }

  return {
    isAvailable: shortages.length === 0,
    shortages,
  };
}

// 4. Atomic Inventory Deduction upon Order Checkout
export async function deductInventoryForOrder(
  cafeId: string,
  items: OrderItem[],
  orderId: string,
  billNumber: string,
  actorName: string,
  actorEmail?: string
): Promise<{ success: boolean; deductedCount: number }> {
  const stockList = getLocalInventory(cafeId);
  const recipes = getLocalRecipes(cafeId);

  if (stockList.length === 0 || Object.keys(recipes).length === 0) {
    return { success: true, deductedCount: 0 };
  }

  const stockMap: Record<string, InventoryItem> = {};
  stockList.forEach((s) => {
    stockMap[s.id] = { ...s };
  });

  let deductedCount = 0;
  const newMovements: InventoryMovement[] = [];

  for (const orderItem of items) {
    const recipe = recipes[orderItem.menuItemId];
    if (!recipe || !recipe.components) continue;

    for (const comp of recipe.components) {
      const invItem = stockMap[comp.inventoryItemId];
      if (!invItem) continue;

      const totalNeeded = comp.quantity * orderItem.quantity;
      const convertedQty = convertUnits(totalNeeded, comp.unit, invItem.unit);

      if (convertedQty !== null) {
        invItem.currentStock = Math.max(0, parseFloat((invItem.currentStock - convertedQty).toFixed(3)));
        invItem.updatedAt = new Date().toISOString();
        deductedCount++;

        const movement: InventoryMovement = {
          id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          cafeId,
          inventoryItemId: invItem.id,
          inventoryItemName: invItem.name,
          type: 'SALE_CONSUMPTION',
          quantity: -convertedQty,
          unit: invItem.unit,
          relatedOrderId: orderId,
          relatedBillNumber: billNumber,
          actorName,
          actorEmail,
          note: `Consumed for ${orderItem.quantity}x ${orderItem.name}`,
          timestamp: new Date().toISOString(),
        };

        newMovements.push(movement);
        saveMovementLocally(cafeId, movement);

        // database async background sync
        if (cafeId && cafeId !== 'default-corner-cafe') {
          try {
            setDoc(doc(db, 'cafes', cafeId, 'inventoryMovements', movement.id), cleanData(movement)).catch(() => {});
          } catch {}
        }
      }
    }
  }

  // Save updated inventory locally & to database
  const updatedStockList = Object.values(stockMap);
  saveLocalInventory(cafeId, updatedStockList);

  if (cafeId && cafeId !== 'default-corner-cafe') {
    for (const inv of updatedStockList) {
      try {
        setDoc(doc(db, 'cafes', cafeId, 'inventory', inv.id), cleanData(inv), { merge: true }).catch(() => {});
      } catch {}
    }
  }

  return { success: true, deductedCount };
}

// 5. Inventory Reversal on Order Void / Refund
export async function reverseInventoryForOrder(
  cafeId: string,
  items: OrderItem[],
  orderId: string,
  billNumber: string,
  actorName: string,
  actorEmail?: string
): Promise<{ success: boolean; restoredCount: number }> {
  const stockList = getLocalInventory(cafeId);
  const recipes = getLocalRecipes(cafeId);

  const stockMap: Record<string, InventoryItem> = {};
  stockList.forEach((s) => {
    stockMap[s.id] = { ...s };
  });

  let restoredCount = 0;

  for (const orderItem of items) {
    const recipe = recipes[orderItem.menuItemId];
    if (!recipe || !recipe.components) continue;

    for (const comp of recipe.components) {
      const invItem = stockMap[comp.inventoryItemId];
      if (!invItem) continue;

      const totalNeeded = comp.quantity * orderItem.quantity;
      const convertedQty = convertUnits(totalNeeded, comp.unit, invItem.unit);

      if (convertedQty !== null) {
        invItem.currentStock = parseFloat((invItem.currentStock + convertedQty).toFixed(3));
        invItem.updatedAt = new Date().toISOString();
        restoredCount++;

        const movement: InventoryMovement = {
          id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          cafeId,
          inventoryItemId: invItem.id,
          inventoryItemName: invItem.name,
          type: 'REFUND_REVERSAL',
          quantity: convertedQty,
          unit: invItem.unit,
          relatedOrderId: orderId,
          relatedBillNumber: billNumber,
          actorName,
          actorEmail,
          note: `Restored stock from voided bill ${billNumber}`,
          timestamp: new Date().toISOString(),
        };

        saveMovementLocally(cafeId, movement);

        if (cafeId && cafeId !== 'default-corner-cafe') {
          try {
            setDoc(doc(db, 'cafes', cafeId, 'inventoryMovements', movement.id), cleanData(movement)).catch(() => {});
          } catch {}
        }
      }
    }
  }

  const updatedStockList = Object.values(stockMap);
  saveLocalInventory(cafeId, updatedStockList);

  if (cafeId && cafeId !== 'default-corner-cafe') {
    for (const inv of updatedStockList) {
      try {
        setDoc(doc(db, 'cafes', cafeId, 'inventory', inv.id), cleanData(inv), { merge: true }).catch(() => {});
      } catch {}
    }
  }

  return { success: true, restoredCount };
}
