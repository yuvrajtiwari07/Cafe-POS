import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  Plus,
  AlertTriangle,
  RotateCcw,
  Search,
  Trash2,
  Edit2,
  FileSpreadsheet,
  Layers,
  Sparkles,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  X,
  Scale,
  ChefHat,
  Info,
} from 'lucide-react';
import { Cafe, InventoryItem, InventoryMovement, InventoryUnit, MenuItem, MovementType, Recipe } from '../types';
import {
  getLocalInventory,
  saveLocalInventory,
  getLocalRecipes,
  saveLocalRecipes,
  getLocalMovements,
  saveMovementLocally,
  convertUnits,
} from '../services/inventoryEngine';
import { db, cleanData } from '../database';
import { doc, collection, onSnapshot, setDoc, deleteDoc } from '../database';
import { showToast } from '../services/toast';

interface InventoryManagerProps {
  cafe: Cafe;
  menu: MenuItem[];
  user: any;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({ cafe, menu, user }) => {
  const [subTab, setSubTab] = useState<'stock' | 'recipes' | 'movements'>('stock');
  const [inventory, setInventory] = useState<InventoryItem[]>(() => getLocalInventory(cafe.id));
  const [recipes, setRecipes] = useState<Record<string, Recipe>>(() => getLocalRecipes(cafe.id));
  const [movements, setMovements] = useState<InventoryMovement[]>(() => getLocalMovements(cafe.id));

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Add / Edit Inventory Item Modal
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [itemUnit, setItemUnit] = useState<InventoryUnit>('piece');
  const [itemStock, setItemStock] = useState('');
  const [itemMinStock, setItemMinStock] = useState('10');
  const [itemCost, setItemCost] = useState('0');

  // Stock Adjustment / Restock / Wastage Modal
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [adjustType, setAdjustType] = useState<'RESTOCK' | 'WASTAGE' | 'MANUAL_ADJUSTMENT'>('RESTOCK');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNote, setAdjustNote] = useState('');

  // Recipe Editor State
  const [selectedMenuDishId, setSelectedMenuDishId] = useState<string>(menu[0]?.id || '');
  const [recipeCompIngredientId, setRecipeCompIngredientId] = useState<string>('');
  const [recipeCompQty, setRecipeCompQty] = useState<string>('');
  const [recipeCompUnit, setRecipeCompUnit] = useState<InventoryUnit>('piece');

  // Delete Item Safety Warning
  const [itemToDelete, setItemToDelete] = useState<{ item: InventoryItem; mappedDishes: string[] } | null>(null);

  // Real-time database sync
  useEffect(() => {
    if (!cafe.id || cafe.id === 'default-corner-cafe') return;

    try {
      const unsubInv = onSnapshot(collection(db, 'cafes', cafe.id, 'inventory'), (snap) => {
        const cloudItems: InventoryItem[] = [];
        snap.forEach((d) => cloudItems.push({ ...(d.data() as InventoryItem), id: d.id }));
        setInventory(cloudItems);
        saveLocalInventory(cafe.id, cloudItems);
      });

      const unsubRec = onSnapshot(collection(db, 'cafes', cafe.id, 'recipes'), (snap) => {
        const cloudRec: Record<string, Recipe> = {};
        snap.forEach((d) => {
          cloudRec[d.id] = { ...(d.data() as Recipe), menuItemId: d.id };
        });
        setRecipes(cloudRec);
        saveLocalRecipes(cafe.id, cloudRec);
      });

      const unsubMov = onSnapshot(collection(db, 'cafes', cafe.id, 'inventoryMovements'), (snap) => {
        const cloudMov: InventoryMovement[] = [];
        snap.forEach((d) => cloudMov.push({ ...(d.data() as InventoryMovement), id: d.id }));
        cloudMov.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setMovements(cloudMov);
      });

      return () => {
        unsubInv();
        unsubRec();
        unsubMov();
      };
    } catch (e) {
      console.warn('Inventory live sync error', e);
    }
  }, [cafe.id]);

  // Categories
  const categories = useMemo(() => {
    const list = Array.from(new Set(inventory.map((i) => i.category || 'General')));
    return ['All', ...list];
  }, [inventory]);

  // Filtered Inventory
  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const matchCat = selectedCategory === 'All' || item.category === selectedCategory;
      const matchSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [inventory, selectedCategory, searchQuery]);

  // Low stock items count
  const lowStockItems = useMemo(() => {
    return inventory.filter((i) => i.currentStock <= i.minimumStock);
  }, [inventory]);

  // Handle Save / Edit Inventory Item
  const handleSaveInventoryItem = async () => {
    if (!itemName.trim() || isNaN(Number(itemStock)) || Number(itemStock) < 0) {
      showToast('Please provide a valid item name and non-negative stock', 'warning');
      return;
    }

    const newItem: InventoryItem = {
      id: editingItem ? editingItem.id : `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      cafeId: cafe.id,
      name: itemName.trim(),
      category: itemCategory.trim() || 'General',
      unit: itemUnit,
      currentStock: Number(itemStock),
      minimumStock: Number(itemMinStock) || 0,
      costPerUnit: Number(itemCost) || 0,
      updatedAt: new Date().toISOString(),
    };

    const updated = editingItem
      ? inventory.map((i) => (i.id === newItem.id ? newItem : i))
      : [...inventory, newItem];

    setInventory(updated);
    saveLocalInventory(cafe.id, updated);

    if (cafe.id && cafe.id !== 'default-corner-cafe') {
      try {
        await setDoc(doc(db, 'cafes', cafe.id, 'inventory', newItem.id), cleanData(newItem), { merge: true });
      } catch (e) {
        console.warn('database inventory save error', e);
      }
    }

    showToast(`Inventory item "${newItem.name}" saved!`, 'success');
    setShowItemModal(false);
    resetItemForm();
  };

  const resetItemForm = () => {
    setEditingItem(null);
    setItemName('');
    setItemCategory('');
    setItemUnit('piece');
    setItemStock('');
    setItemMinStock('10');
    setItemCost('0');
  };

  // Open Edit Item
  const handleEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemCategory(item.category);
    setItemUnit(item.unit);
    setItemStock(item.currentStock.toString());
    setItemMinStock(item.minimumStock.toString());
    setItemCost(item.costPerUnit.toString());
    setShowItemModal(true);
  };

  // Safe Delete Item (Checks Recipes first)
  const initiateDeleteItem = (item: InventoryItem) => {
    // Check if any recipe references this item
    const mappedDishes: string[] = [];
    Object.entries(recipes).forEach(([dishId, rec]) => {
      if (rec.components?.some((c) => c.inventoryItemId === item.id)) {
        const dish = menu.find((m) => m.id === dishId);
        mappedDishes.push(dish ? dish.name : dishId);
      }
    });

    if (mappedDishes.length > 0) {
      setItemToDelete({ item, mappedDishes });
    } else {
      executeDeleteItem(item.id);
    }
  };

  const executeDeleteItem = async (itemId: string) => {
    const updated = inventory.filter((i) => i.id !== itemId);
    setInventory(updated);
    saveLocalInventory(cafe.id, updated);

    if (cafe.id && cafe.id !== 'default-corner-cafe') {
      try {
        await deleteDoc(doc(db, 'cafes', cafe.id, 'inventory', itemId));
      } catch (e) {
        console.warn('database delete error', e);
      }
    }

    showToast('Inventory item deleted', 'info');
    setItemToDelete(null);
  };

  // Handle Manual Stock Adjustment / Restock / Wastage
  const handleApplyAdjustment = async () => {
    if (!adjustingItem || isNaN(Number(adjustQty)) || Number(adjustQty) <= 0) {
      showToast('Please enter a valid positive quantity', 'warning');
      return;
    }

    const qty = Number(adjustQty);
    let stockDelta = 0;
    if (adjustType === 'RESTOCK') stockDelta = qty;
    else if (adjustType === 'WASTAGE' || adjustType === 'MANUAL_ADJUSTMENT') stockDelta = -qty;

    const newStock = Math.max(0, parseFloat((adjustingItem.currentStock + stockDelta).toFixed(3)));

    const updatedItem: InventoryItem = {
      ...adjustingItem,
      currentStock: newStock,
      updatedAt: new Date().toISOString(),
    };

    const updatedList = inventory.map((i) => (i.id === updatedItem.id ? updatedItem : i));
    setInventory(updatedList);
    saveLocalInventory(cafe.id, updatedList);

    const movement: InventoryMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      cafeId: cafe.id,
      inventoryItemId: adjustingItem.id,
      inventoryItemName: adjustingItem.name,
      type: adjustType,
      quantity: stockDelta,
      unit: adjustingItem.unit,
      actorName: user?.displayName || 'Owner',
      actorEmail: user?.email,
      note: adjustNote.trim() || undefined,
      timestamp: new Date().toISOString(),
    };

    saveMovementLocally(cafe.id, movement);
    setMovements((prev) => [movement, ...prev]);

    if (cafe.id && cafe.id !== 'default-corner-cafe') {
      try {
        await setDoc(doc(db, 'cafes', cafe.id, 'inventory', updatedItem.id), cleanData(updatedItem), { merge: true });
        await setDoc(doc(db, 'cafes', cafe.id, 'inventoryMovements', movement.id), cleanData(movement));
      } catch (e) {
        console.warn('Adjustment sync error', e);
      }
    }

    showToast(
      `Stock adjusted: ${adjustingItem.name} is now ${newStock} ${adjustingItem.unit}`,
      'success'
    );
    setAdjustingItem(null);
    setAdjustQty('');
    setAdjustNote('');
  };

  // Recipe Components for Selected Menu Dish
  const currentRecipe = useMemo(() => {
    return recipes[selectedMenuDishId] || { menuItemId: selectedMenuDishId, cafeId: cafe.id, components: [] };
  }, [recipes, selectedMenuDishId, cafe.id]);

  const selectedDish = useMemo(() => {
    return menu.find((m) => m.id === selectedMenuDishId);
  }, [menu, selectedMenuDishId]);

  // Compute live COGS for current dish recipe
  const cogsData = useMemo(() => {
    if (!currentRecipe || !currentRecipe.components) return { cogs: 0, margin: 0 };
    let totalCost = 0;

    currentRecipe.components.forEach((comp) => {
      const inv = inventory.find((i) => i.id === comp.inventoryItemId);
      if (inv && inv.costPerUnit > 0) {
        const factor = convertUnits(comp.quantity, comp.unit, inv.unit);
        if (factor !== null) {
          totalCost += factor * inv.costPerUnit;
        }
      }
    });

    const price = selectedDish?.price || 0;
    const margin = price > 0 ? ((price - totalCost) / price) * 100 : 0;
    return { cogs: totalCost, margin };
  }, [currentRecipe, inventory, selectedDish]);

  // Add Ingredient to Recipe
  const handleAddRecipeComponent = async () => {
    if (!recipeCompIngredientId || isNaN(Number(recipeCompQty)) || Number(recipeCompQty) <= 0) {
      showToast('Select an ingredient and enter a valid quantity', 'warning');
      return;
    }

    const existingComponents = currentRecipe.components || [];
    const filtered = existingComponents.filter((c) => c.inventoryItemId !== recipeCompIngredientId);
    const newComponent = {
      inventoryItemId: recipeCompIngredientId,
      quantity: Number(recipeCompQty),
      unit: recipeCompUnit,
    };

    const updatedRecipe: Recipe = {
      menuItemId: selectedMenuDishId,
      cafeId: cafe.id,
      components: [...filtered, newComponent],
      updatedAt: new Date().toISOString(),
    };

    const newRecipes = { ...recipes, [selectedMenuDishId]: updatedRecipe };
    setRecipes(newRecipes);
    saveLocalRecipes(cafe.id, newRecipes);

    if (cafe.id && cafe.id !== 'default-corner-cafe') {
      try {
        await setDoc(doc(db, 'cafes', cafe.id, 'recipes', selectedMenuDishId), cleanData(updatedRecipe), { merge: true });
      } catch (e) {
        console.warn('Recipe save error', e);
      }
    }

    showToast('Ingredient added to dish recipe!', 'success');
    setRecipeCompIngredientId('');
    setRecipeCompQty('');
  };

  // Remove Ingredient from Recipe
  const handleRemoveRecipeComponent = async (invItemId: string) => {
    const updatedRecipe: Recipe = {
      ...currentRecipe,
      components: (currentRecipe.components || []).filter((c) => c.inventoryItemId !== invItemId),
      updatedAt: new Date().toISOString(),
    };

    const newRecipes = { ...recipes, [selectedMenuDishId]: updatedRecipe };
    setRecipes(newRecipes);
    saveLocalRecipes(cafe.id, newRecipes);

    if (cafe.id && cafe.id !== 'default-corner-cafe') {
      try {
        await setDoc(doc(db, 'cafes', cafe.id, 'recipes', selectedMenuDishId), cleanData(updatedRecipe), { merge: true });
      } catch (e) {
        console.warn('Recipe update error', e);
      }
    }

    showToast('Ingredient removed from recipe', 'info');
  };

  // CSV Export of Inventory Movements using Blob + UTF-8 BOM
  const exportMovementsCSV = () => {
    if (movements.length === 0) {
      showToast('No movements recorded yet to export', 'info');
      return;
    }

    const headers = ['Movement ID', 'Timestamp', 'Ingredient', 'Type', 'Quantity', 'Unit', 'Related Order', 'Actor', 'Note'];
    const rows = movements.map((m) => [
      m.id,
      m.timestamp,
      m.inventoryItemName,
      m.type,
      m.quantity,
      m.unit,
      m.relatedBillNumber || m.relatedOrderId || 'N/A',
      m.actorName,
      m.note || '',
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','),
       ...rows.map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Inventory_Movements_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast(`Exported ${movements.length} inventory movements to CSV!`, 'success');
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 space-y-4">
      {/* Sub-tabs header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#fffbf5] p-3 rounded-2xl border border-[#eedecb] shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-orange-100 text-[#ea580c] flex items-center justify-center">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base text-[#2b2320]">Inventory & Recipe Engine</h2>
            <p className="text-xs text-[#7d6e67]">Real-time stock tracking, recipes (BOM), and automatic deduction</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-[#f5ede0] p-1 rounded-xl">
          <button
            onClick={() => setSubTab('stock')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              subTab === 'stock' ? 'bg-[#ea580c] text-white shadow-xs' : 'text-[#615149] hover:bg-white/50'
            }`}
          >
            Stock Overview ({inventory.length})
          </button>
          <button
            onClick={() => setSubTab('recipes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              subTab === 'recipes' ? 'bg-[#ea580c] text-white shadow-xs' : 'text-[#615149] hover:bg-white/50'
            }`}
          >
            Recipe Mapper (BOM)
          </button>
          <button
            onClick={() => setSubTab('movements')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              subTab === 'movements' ? 'bg-[#ea580c] text-white shadow-xs' : 'text-[#615149] hover:bg-white/50'
            }`}
          >
            Audit Movements ({movements.length})
          </button>
        </div>
      </div>

      {/* Low Stock Warning Banner */}
      {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
            <div>
              <h4 className="font-bold text-xs sm:text-sm text-amber-900">
                Low Stock Alert: {lowStockItems.length} ingredient(s) below threshold
              </h4>
              <p className="text-[11px] text-amber-800">
                {lowStockItems.map((i) => `${i.name} (${i.currentStock} ${i.unit})`).join(', ')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSubTab('stock')}
            className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 transition shrink-0 cursor-pointer"
          >
            View Stock
          </button>
        </div>
      )}

      {/* SUB-TAB 1: STOCK ITEMS */}
      {subTab === 'stock' && (
        <div className="space-y-4">
          {/* Action & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#8c7a72]" />
                <input
                  type="text"
                  placeholder="Search ingredient or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-[#eedecb] text-xs font-medium text-[#2b2320] outline-hidden focus:border-[#ea580c]"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-white border border-[#eedecb] px-3 py-2 rounded-xl text-xs font-semibold text-[#2b2320] outline-hidden cursor-pointer"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => {
                resetItemForm();
                setShowItemModal(true);
              }}
              className="bg-[#ea580c] hover:bg-[#c2410c] text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Stock Item</span>
            </button>
          </div>

          {/* Stock Grid */}
          {filteredInventory.length === 0 ? (
            <div className="bg-[#fffbf5] rounded-2xl border border-dashed border-[#eedecb] p-8 text-center">
              <Boxes className="w-10 h-10 text-[#eedecb] mx-auto mb-2" />
              <h3 className="font-bold text-sm text-[#2b2320]">No inventory items yet</h3>
              <p className="text-xs text-[#7d6e67] mt-1">
                Add your raw materials (e.g. Milk, Coffee Beans, Glasses, Cheese) to track automatic deduction.
              </p>
              <button
                onClick={() => {
                  resetItemForm();
                  setShowItemModal(true);
                }}
                className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#ea580c] text-white font-bold text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create First Item</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredInventory.map((item) => {
                const isLow = item.currentStock <= item.minimumStock;
                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-2xl border p-4 flex flex-col justify-between shadow-xs transition ${
                      isLow ? 'border-amber-400 bg-amber-50/20' : 'border-[#eedecb]'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#ea580c] bg-orange-50 px-2 py-0.5 rounded-md">
                            {item.category || 'General'}
                          </span>
                          <h4 className="font-bold text-sm text-[#2b2320] mt-1">{item.name}</h4>
                        </div>
                        {isLow && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> Low
                          </span>
                        )}
                      </div>

                      {/* Stock indicator */}
                      <div className="mt-3 bg-[#faf6f0] p-2.5 rounded-xl border border-[#eedecb]/70 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-[#7d6e67] block">In Stock</span>
                          <span className="font-black text-lg text-[#2b2320]">
                            {item.currentStock}{' '}
                            <span className="text-xs font-normal text-[#7d6e67]">{item.unit}</span>
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-[#7d6e67] block">Alert Below</span>
                          <span className="font-bold text-xs text-stone-600">
                            {item.minimumStock} {item.unit}
                          </span>
                        </div>
                      </div>

                      {item.costPerUnit > 0 && (
                        <p className="text-[11px] text-[#7d6e67] mt-2">
                          Cost: <span className="font-bold text-stone-800">₹{item.costPerUnit}</span> / {item.unit}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-4 pt-3 border-t border-[#eedecb]/60 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setAdjustingItem(item);
                            setAdjustType('RESTOCK');
                          }}
                          className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold transition cursor-pointer"
                        >
                          + Restock
                        </button>
                        <button
                          onClick={() => {
                            setAdjustingItem(item);
                            setAdjustType('WASTAGE');
                          }}
                          className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 text-[11px] font-bold transition cursor-pointer"
                        >
                          - Wastage
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditItem(item)}
                          className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition cursor-pointer"
                          title="Edit Item"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => initiateDeleteItem(item)}
                          className="p-1 rounded-md text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          title="Delete Item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: RECIPE (BOM) MAPPER */}
      {subTab === 'recipes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Dish Selector */}
          <div className="lg:col-span-4 bg-[#fffbf5] p-3 rounded-2xl border border-[#eedecb] shadow-xs">
            <h3 className="font-bold text-sm text-[#2b2320] mb-2 flex items-center gap-1.5">
              <ChefHat className="w-4 h-4 text-[#ea580c]" />
              <span>Select Dish to Map Recipe</span>
            </h3>
            <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
              {menu.map((dish) => {
                const rec = recipes[dish.id];
                const count = rec?.components?.length || 0;
                return (
                  <button
                    key={dish.id}
                    onClick={() => setSelectedMenuDishId(dish.id)}
                    className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                      selectedMenuDishId === dish.id
                        ? 'bg-orange-50 border-[#ea580c] shadow-xs'
                        : 'bg-white border-[#eedecb] hover:bg-[#faf6f0]'
                    }`}
                  >
                    <div>
                      <h4 className="font-bold text-xs text-[#2b2320]">{dish.name}</h4>
                      <span className="text-[10px] text-[#7d6e67]">₹{dish.price} · {dish.category}</span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        count > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-500'
                      }`}
                    >
                      {count > 0 ? `${count} ingr.` : 'No recipe'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Recipe Editor */}
          <div className="lg:col-span-8 bg-white p-4 rounded-2xl border border-[#eedecb] shadow-xs space-y-4">
            {selectedDish ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#eedecb]">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase text-[#ea580c] bg-orange-100 px-2 py-0.5 rounded-md">
                      Bill of Materials (BOM)
                    </span>
                    <h3 className="font-bold text-base text-[#2b2320] mt-1">{selectedDish.name}</h3>
                    <p className="text-xs text-[#7d6e67]">Selling Price: ₹{selectedDish.price}</p>
                  </div>

                  {/* COGS and Profit Margin calculation */}
                  <div className="bg-[#faf6f0] p-2.5 rounded-xl border border-[#eedecb] text-right">
                    <span className="text-[10px] text-[#7d6e67] block">Estimated Cost of Goods (COGS)</span>
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-black text-sm text-[#2b2320]">₹{cogsData.cogs.toFixed(2)}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cogsData.margin >= 50 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {cogsData.margin.toFixed(0)}% Margin
                      </span>
                    </div>
                  </div>
                </div>

                {/* Add Ingredient Row */}
                <div className="p-3 rounded-xl bg-[#faf6f0] border border-[#eedecb] space-y-2">
                  <h4 className="font-bold text-xs text-[#2b2320]">Add Recipe Component</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-6">
                      <select
                        value={recipeCompIngredientId}
                        onChange={(e) => {
                          setRecipeCompIngredientId(e.target.value);
                          const target = inventory.find((i) => i.id === e.target.value);
                          if (target) setRecipeCompUnit(target.unit);
                        }}
                        className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-[#eedecb] text-xs font-semibold text-[#2b2320] outline-hidden"
                      >
                        <option value="">Select Raw Ingredient...</option>
                        {inventory.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name} (Unit: {i.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="Quantity"
                        value={recipeCompQty}
                        onChange={(e) => setRecipeCompQty(e.target.value)}
                        className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-[#eedecb] text-xs font-bold text-[#2b2320] outline-hidden"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <select
                        value={recipeCompUnit}
                        onChange={(e) => setRecipeCompUnit(e.target.value as InventoryUnit)}
                        className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-[#eedecb] text-xs font-semibold text-[#2b2320] outline-hidden"
                      >
                        <option value="ml">ml</option>
                        <option value="L">L</option>
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="piece">piece</option>
                        <option value="packet">packet</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleAddRecipeComponent}
                    className="w-full py-1.5 bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    + Add Ingredient to Recipe
                  </button>
                </div>

                {/* Current Recipe Ingredients List */}
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-[#2b2320]">Recipe Ingredients ({currentRecipe.components?.length || 0})</h4>
                  {!currentRecipe.components || currentRecipe.components.length === 0 ? (
                    <p className="text-xs text-[#8c7a72] italic py-4 text-center">
                      No ingredients mapped yet. Add ingredients above so this dish automatically deducts stock upon sale!
                    </p>
                  ) : (
                    <div className="divide-y divide-[#eedecb]/70 border border-[#eedecb] rounded-xl overflow-hidden">
                      {currentRecipe.components.map((comp) => {
                        const inv = inventory.find((i) => i.id === comp.inventoryItemId);
                        return (
                          <div key={comp.inventoryItemId} className="p-2.5 bg-white flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#2b2320]">{inv ? inv.name : 'Unknown Item'}</span>
                              <span className="text-[11px] font-mono bg-orange-100 text-[#ea580c] font-black px-2 py-0.5 rounded">
                                {comp.quantity} {comp.unit}
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              {inv && inv.costPerUnit > 0 && (
                                <span className="text-stone-500 text-[11px]">
                                  Cost: ₹
                                  {((convertUnits(comp.quantity, comp.unit, inv.unit) || 0) * inv.costPerUnit).toFixed(2)}
                                </span>
                              )}
                              <button
                                onClick={() => handleRemoveRecipeComponent(comp.inventoryItemId)}
                                className="text-stone-400 hover:text-rose-600 transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-[#7d6e67]">Select a dish on the left to map ingredients.</p>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: MOVEMENT AUDIT LEDGER */}
      {subTab === 'movements' && (
        <div className="bg-white rounded-2xl border border-[#eedecb] p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-[#2b2320]">Stock Movement Audit Ledger</h3>
              <p className="text-xs text-[#7d6e67]">Full log of sales consumption, manual adjustments, restocks, and reversals</p>
            </div>
            <button
              onClick={exportMovementsCSV}
              className="bg-[#f5ede0] hover:bg-[#ebdccb] text-[#2b2320] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#2b2320]">
              <thead className="bg-[#f5ede0] text-[#7d6e67] uppercase font-bold text-[10px] tracking-wider border-b border-[#eedecb]">
                <tr>
                  <th className="px-3.5 py-2.5">Date & Time</th>
                  <th className="px-3.5 py-2.5">Ingredient</th>
                  <th className="px-3.5 py-2.5">Type</th>
                  <th className="px-3.5 py-2.5">Quantity Change</th>
                  <th className="px-3.5 py-2.5">Order Ref</th>
                  <th className="px-3.5 py-2.5">Actor</th>
                  <th className="px-3.5 py-2.5">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eedecb]/70">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3.5 py-8 text-center text-[#8c7a72]">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id} className="hover:bg-[#fcf9f5] transition">
                      <td className="px-3.5 py-2.5 text-stone-500 text-[11px] font-mono">
                        {new Date(m.timestamp).toLocaleDateString()} {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-3.5 py-2.5 font-bold text-stone-800">{m.inventoryItemName}</td>
                      <td className="px-3.5 py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.type === 'SALE_CONSUMPTION'
                              ? 'bg-rose-100 text-rose-800'
                              : m.type === 'RESTOCK'
                              ? 'bg-emerald-100 text-emerald-800'
                              : m.type === 'REFUND_REVERSAL'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {m.type}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 font-mono font-bold">
                        <span className={m.quantity > 0 ? 'text-emerald-700' : 'text-rose-700'}>
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity} {m.unit}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-[#ea580c] font-bold">
                        {m.relatedBillNumber || m.relatedOrderId || '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-stone-600">{m.actorName}</td>
                      <td className="px-3.5 py-2.5 text-stone-500 italic max-w-[180px] truncate">{m.note || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT INVENTORY ITEM */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl border border-[#eedecb] space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-[#eedecb]">
              <h3 className="font-bold text-sm text-[#2b2320]">
                {editingItem ? 'Edit Inventory Item' : 'New Raw Stock Item'}
              </h3>
              <button onClick={() => setShowItemModal(false)} className="text-stone-400 hover:text-stone-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">Item Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Full Cream Milk, Coffee Beans, Burger Buns"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl border border-[#eedecb] text-xs font-semibold outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-stone-700 block mb-1">Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Dairy, Packaging, Bakery"
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value)}
                    className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl border border-[#eedecb] text-xs font-semibold outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-stone-700 block mb-1">Stock Unit *</label>
                  <select
                    value={itemUnit}
                    onChange={(e) => setItemUnit(e.target.value as InventoryUnit)}
                    className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl border border-[#eedecb] text-xs font-semibold outline-hidden"
                  >
                    <option value="L">Liters (L)</option>
                    <option value="ml">Milliliters (ml)</option>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="g">Grams (g)</option>
                    <option value="piece">Piece (pcs)</option>
                    <option value="packet">Packet (pkt)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-stone-700 block mb-1">Current Stock *</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={itemStock}
                    onChange={(e) => setItemStock(e.target.value)}
                    className="w-full bg-[#faf6f0] px-2.5 py-1.5 rounded-xl border border-[#eedecb] text-xs font-bold outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-stone-700 block mb-1">Min. Alert</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={itemMinStock}
                    onChange={(e) => setItemMinStock(e.target.value)}
                    className="w-full bg-[#faf6f0] px-2.5 py-1.5 rounded-xl border border-[#eedecb] text-xs font-bold outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-stone-700 block mb-1">Cost / Unit (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={itemCost}
                    onChange={(e) => setItemCost(e.target.value)}
                    className="w-full bg-[#faf6f0] px-2.5 py-1.5 rounded-xl border border-[#eedecb] text-xs font-bold outline-hidden"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowItemModal(false)}
                className="flex-1 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveInventoryItem}
                className="flex-1 py-2 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold text-xs cursor-pointer"
              >
                Save Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: STOCK ADJUSTMENT / RESTOCK / WASTAGE */}
      {adjustingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl border border-[#eedecb] space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-[#eedecb]">
              <h3 className="font-bold text-sm text-[#2b2320]">Adjust Stock: {adjustingItem.name}</h3>
              <button onClick={() => setAdjustingItem(null)} className="text-stone-400 hover:text-stone-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#faf6f0] p-2.5 rounded-xl border border-[#eedecb] flex items-center justify-between text-xs">
              <span className="text-[#7d6e67]">Current Level:</span>
              <span className="font-bold text-stone-900">
                {adjustingItem.currentStock} {adjustingItem.unit}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">Adjustment Type</label>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => setAdjustType('RESTOCK')}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition ${
                      adjustType === 'RESTOCK'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-stone-700 border-stone-200'
                    }`}
                  >
                    + Restock
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('WASTAGE')}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition ${
                      adjustType === 'WASTAGE'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white text-stone-700 border-stone-200'
                    }`}
                  >
                    - Wastage
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('MANUAL_ADJUSTMENT')}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition ${
                      adjustType === 'MANUAL_ADJUSTMENT'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-stone-700 border-stone-200'
                    }`}
                  >
                    - Correction
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">
                  Quantity ({adjustingItem.unit}) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={`Amount in ${adjustingItem.unit}`}
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl border border-[#eedecb] text-xs font-bold outline-hidden"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1">Audit Note (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Fresh dairy delivery, spillage, spoiled batch"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl border border-[#eedecb] text-xs font-medium outline-hidden"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setAdjustingItem(null)}
                className="flex-1 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyAdjustment}
                className="flex-1 py-2 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold text-xs cursor-pointer"
              >
                Apply Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE SAFETY WARNING (Section 80: INVENTORY ITEM DELETION SAFETY) */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl border border-rose-300 space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Ingredient Used in Recipes!</span>
            </div>

            <p className="text-xs text-stone-700">
              <strong className="text-stone-900">{itemToDelete.item.name}</strong> is currently used in{' '}
              <strong className="text-rose-700">{itemToDelete.mappedDishes.length} menu recipe(s)</strong>:
            </p>

            <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-200 text-xs text-rose-900 max-h-32 overflow-y-auto">
              <ul className="list-disc pl-4 space-y-0.5">
                {itemToDelete.mappedDishes.map((name, i) => (
                  <li key={i}>{name}</li>
                ))}
              </ul>
            </div>

            <p className="text-[11px] text-stone-500">
              To preserve recipe calculations and prevent errors during checkout, remove this ingredient from those recipes before deleting.
            </p>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setItemToDelete(null)}
                className="flex-1 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs cursor-pointer"
              >
                Keep Item
              </button>
              <button
                onClick={() => {
                  setSubTab('recipes');
                  setItemToDelete(null);
                }}
                className="flex-1 py-2 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold text-xs cursor-pointer"
              >
                Edit Recipes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
