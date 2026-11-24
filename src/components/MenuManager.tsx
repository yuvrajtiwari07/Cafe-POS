import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Check,
  RotateCcw,
  Sparkles,
  Search,
  IndianRupee,
  Edit2,
  Save,
  Camera,
  Upload,
  Loader2,
  X,
  FileImage,
  AlertCircle,
  UtensilsCrossed,
  Star,
  Tag,
} from 'lucide-react';
import { Cafe, MenuItem } from '../types';
import { saveLocalMenu } from '../services/storage';
import { doc, setDoc, deleteDoc } from '../database';
import { db, auth, cleanData } from '../database';
import { showToast } from '../services/toast';

const COMMON_EMOJIS = ['☕', '🍵', '🥤', '🧃', '🥪', '🍟', '🍔', '🍕', '🍰', '🧁', '🍨', '🥐', '🍛', '🍜', '🥗', '🍪', '🧇', '🥞', '🍩', '🍫'];

const DEFAULT_CATEGORIES = [
  'Hot Beverages',
  'Cold Beverages',
  'Combos',
  'Bites & Fries',
  'Sandwiches',
  'Meals',
  'Desserts',
];

interface MenuManagerProps {
  cafe: Cafe;
  menu: MenuItem[];
  onMenuUpdated: (menu: MenuItem[]) => void;
}

export const MenuManager: React.FC<MenuManagerProps> = ({
  cafe,
  menu,
  onMenuUpdated,
}) => {
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // Full item edit modal state
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [isCustomCategory, setIsCustomCategory] = useState<boolean>(false);
  const [customCategory, setCustomCategory] = useState<string>('');
  const [editItemPrice, setEditItemPrice] = useState<number>(100);
  const [editDesc, setEditDesc] = useState<string>('');
  const [editIsVeg, setEditIsVeg] = useState<boolean>(true);
  const [editEmoji, setEditEmoji] = useState<string>('☕');
  const [editIsAvailable, setEditIsAvailable] = useState<boolean>(true);
  const [editPopular, setEditPopular] = useState<boolean>(false);

  // New item form state
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemCategory, setNewItemCategory] = useState<string>('Hot Beverages');
  const [newIsCustomCategory, setNewIsCustomCategory] = useState<boolean>(false);
  const [newCustomCategory, setNewCustomCategory] = useState<string>('');
  const [newItemPrice, setNewItemPrice] = useState<number>(100);
  const [newItemDesc, setNewItemDesc] = useState<string>('');
  const [newItemIsVeg, setNewItemIsVeg] = useState<boolean>(true);
  const [newItemEmoji, setNewItemEmoji] = useState<string>('☕');
  const [newItemPopular, setNewItemPopular] = useState<boolean>(false);

  // AI Menu Photo Scanner State
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/jpeg');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedItems, setScannedItems] = useState<any[]>([]);
  const [selectedScanIndexes, setSelectedScanIndexes] = useState<number[]>([]);

  // Compute all available categories from defaults + current menu
  const allCategories = Array.from(
    new Set([
      ...DEFAULT_CATEGORIES,
      ...menu.map((m) => m.category).filter((c) => Boolean(c && c.trim())),
    ])
  );

  const filtered = menu.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory =
      selectedCategory === 'all' || item.category.toLowerCase() === selectedCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  const toggleAvailability = async (item: MenuItem) => {
    const updated = menu.map((m) =>
      m.id === item.id ? { ...m, isAvailable: !m.isAvailable } : m
    );
    saveLocalMenu(cafe.id, updated);
    onMenuUpdated(updated);

    // Sync to database if authenticated
    if (auth.currentUser) {
      try {
        const docRef = doc(db, 'cafes', cafe.id, 'menu', item.id);
        await setDoc(docRef, cleanData({ ...item, isAvailable: !item.isAvailable }), { merge: true });
      } catch (e) {
        console.warn('Could not sync availability to database', e);
      }
    }
  };

  const handleOpenEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditCategory(item.category);
    setIsCustomCategory(false);
    setCustomCategory('');
    setEditItemPrice(item.price);
    setEditDesc(item.description || '');
    setEditIsVeg(item.isVeg);
    setEditEmoji(item.imageEmoji || '☕');
    setEditIsAvailable(item.isAvailable);
    setEditPopular(!!item.popular);
  };

  const handleSaveEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    if (!editName.trim()) {
      showToast('Item name cannot be empty', 'error');
      return;
    }
    if (editItemPrice <= 0) {
      showToast('Price must be greater than 0', 'error');
      return;
    }

    const finalCategory =
      (isCustomCategory ? customCategory.trim() : editCategory.trim()) || 'General';

    const updatedItem: MenuItem = {
      ...editingItem,
      name: editName.trim(),
      category: finalCategory,
      price: editItemPrice,
      description: editDesc.trim(),
      isVeg: editIsVeg,
      imageEmoji: editEmoji.trim() || '🍽️',
      isAvailable: editIsAvailable,
      popular: editPopular,
      updatedAt: new Date().toISOString(),
    };

    const updated = menu.map((m) => (m.id === editingItem.id ? updatedItem : m));
    saveLocalMenu(cafe.id, updated);
    onMenuUpdated(updated);

    if (auth.currentUser) {
      try {
        const docRef = doc(db, 'cafes', cafe.id, 'menu', editingItem.id);
        await setDoc(docRef, cleanData(updatedItem), { merge: true });
      } catch (err) {
        console.warn('Could not sync updated item to database', err);
      }
    }

    showToast(`Updated "${updatedItem.name}"`, 'success');
    setEditingItem(null);
  };

  const handleSavePrice = async (itemId: string) => {
    const updated = menu.map((m) =>
      m.id === itemId ? { ...m, price: editPrice } : m
    );
    saveLocalMenu(cafe.id, updated);
    onMenuUpdated(updated);
    setEditingItemId(null);

    if (auth.currentUser) {
      try {
        const item = updated.find((m) => m.id === itemId);
        if (item) {
          const docRef = doc(db, 'cafes', cafe.id, 'menu', itemId);
          await setDoc(docRef, cleanData(item), { merge: true });
        }
      } catch (e) {
        console.warn('Could not sync price to database', e);
      }
    }
    showToast('Price updated', 'success');
  };

  const handleAddNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || newItemPrice <= 0) return;

    const finalCategory =
      (newIsCustomCategory ? newCustomCategory.trim() : newItemCategory.trim()) || 'General';

    const newItem: MenuItem = {
      id: `item-${Date.now()}`,
      cafeId: cafe.id,
      name: newItemName.trim(),
      category: finalCategory,
      price: newItemPrice,
      description: newItemDesc.trim() || '',
      isVeg: newItemIsVeg,
      isAvailable: true,
      popular: newItemPopular,
      imageEmoji: newItemEmoji,
      updatedAt: new Date().toISOString(),
    };

    const updated = [newItem, ...menu];
    saveLocalMenu(cafe.id, updated);
    onMenuUpdated(updated);

    if (auth.currentUser) {
      try {
        const docRef = doc(db, 'cafes', cafe.id, 'menu', newItem.id);
        await setDoc(docRef, cleanData(newItem));
      } catch (err) {
        console.warn('Could not sync new item to database', err);
      }
    }

    showToast(`Added "${newItem.name}" to menu`, 'success');

    // Reset
    setNewItemName('');
    setNewItemDesc('');
    setNewItemPrice(100);
    setNewIsCustomCategory(false);
    setNewCustomCategory('');
    setNewItemPopular(false);
    setShowAddModal(false);
  };

  const handleDeleteItem = async (item: MenuItem) => {
    if (!confirm(`Are you sure you want to delete "${item.name}" from the menu?`)) {
      return;
    }
    const updated = menu.filter((m) => m.id !== item.id);
    saveLocalMenu(cafe.id, updated);
    onMenuUpdated(updated);

    if (auth.currentUser) {
      try {
        const docRef = doc(db, 'cafes', cafe.id, 'menu', item.id);
        await deleteDoc(docRef);
      } catch (err) {
        console.warn('Could not delete item from database', err);
      }
    }
  };

  const handleClearAllItems = async () => {
    if (menu.length === 0) return;
    if (!confirm('Are you sure you want to delete ALL items from this menu? This will clear all dishes.')) {
      return;
    }
    const previous = [...menu];
    saveLocalMenu(cafe.id, []);
    onMenuUpdated([]);

    if (auth.currentUser) {
      try {
        for (const itm of previous) {
          const docRef = doc(db, 'cafes', cafe.id, 'menu', itm.id);
          await deleteDoc(docRef);
        }
      } catch (err) {
        console.warn('Could not clear items in database', err);
      }
    }
  };

  // Image Upload with Auto Client-Side Compression (reduces 12MB photos to ~300KB to avoid rate limits)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    setScanError(null);
    setScannedItems([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // Scale down camera photos to max 1600px width/height
        const maxDim = 1600;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          setImagePreview(compressed);
          setImageBase64(compressed);
          setImageMime('image/jpeg');
        } else {
          setImagePreview(rawDataUrl);
          setImageBase64(rawDataUrl);
          setImageMime(file.type || 'image/jpeg');
        }
        setIsCompressing(false);
      };
      img.onerror = () => {
        setImagePreview(rawDataUrl);
        setImageBase64(rawDataUrl);
        setIsCompressing(false);
      };
      img.src = rawDataUrl;
    };
    reader.onerror = () => setIsCompressing(false);
    reader.readAsDataURL(file);
  };

  const handleStartScan = async () => {
    if (!imageBase64) return;
    setIsScanning(true);
    setScanError(null);

    try {
      const res = await fetch('/api/extract-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType: imageMime,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze menu image.');
      }

      if (!Array.isArray(data.items) || data.items.length === 0) {
        throw new Error('No menu items could be detected in this photo. Please try a clearer picture.');
      }

      setScannedItems(data.items);
      setSelectedScanIndexes(data.items.map((_: any, idx: number) => idx));
    } catch (err: any) {
      setScanError(err.message || 'Error scanning menu photo.');
    } finally {
      setIsScanning(false);
    }
  };

  // Import scanned items - single click only, deduplicates by name, and auto-closes panel
  const handleImportScannedItems = async () => {
    if (isImporting) return;
    const toImport = scannedItems.filter((_, idx) => selectedScanIndexes.includes(idx));
    if (toImport.length === 0) return;

    setIsImporting(true);

    try {
      // Deduplicate by name against existing menu items (case-insensitive & trimmed)
      const existingNames = new Set(menu.map((m) => m.name.toLowerCase().trim()));
      const uniqueNewItems: MenuItem[] = [];
      let skippedDuplicates = 0;

      toImport.forEach((item, i) => {
        const cleanName = (item.name || 'Unnamed Dish').trim();
        if (existingNames.has(cleanName.toLowerCase())) {
          skippedDuplicates++;
          return;
        }
        existingNames.add(cleanName.toLowerCase());

        uniqueNewItems.push({
          id: `ai-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
          cafeId: cafe.id,
          name: cleanName,
          category: item.category || 'General',
          price: typeof item.price === 'number' && item.price > 0 ? item.price : 100,
          description: item.description || '',
          isVeg: typeof item.isVeg === 'boolean' ? item.isVeg : true,
          isAvailable: true,
          imageEmoji: item.imageEmoji || '🍽️',
          updatedAt: new Date().toISOString(),
        });
      });

      if (uniqueNewItems.length === 0) {
        showToast('All selected items already exist in your menu.', 'info');
        setShowScannerModal(false);
        setImagePreview(null);
        setImageBase64(null);
        setScannedItems([]);
        return;
      }

      const updated = [...uniqueNewItems, ...menu];
      saveLocalMenu(cafe.id, updated);
      onMenuUpdated(updated);

      // Sync each item to database so other devices receive it via onSnapshot
      if (auth.currentUser) {
        await Promise.all(
          uniqueNewItems.map((itm) =>
            setDoc(doc(db, 'cafes', cafe.id, 'menu', itm.id), cleanData(itm))
          )
        );
      }

      showToast(
        `Imported ${uniqueNewItems.length} new dishes!${skippedDuplicates > 0 ? ` (${skippedDuplicates} duplicates skipped)` : ''}`,
        'success'
      );

      // Auto-close panel and clean up state immediately
      setShowScannerModal(false);
      setImagePreview(null);
      setImageBase64(null);
      setScannedItems([]);
      setSelectedScanIndexes([]);
    } catch (err: any) {
      console.error('Import failed', err);
      showToast('Error importing items to menu.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-4 space-y-4">
      {/* Top Bar */}
      <div className="bg-[#fffbf5] p-3 sm:p-4 rounded-2xl border border-[#eedecb] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#2b2320]">
            Restaurant Menu & Pricing Manager
          </h2>
          <p className="text-xs text-[#7d6e67]">
            Update prices, toggle availability, or upload a photo to auto-extract the entire menu with AI.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* AI Menu Photo Scanner Trigger */}
          <button
            onClick={() => setShowScannerModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            title="Scan menu card or flyer photo to import items automatically"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Upload Menu Photo (AI)</span>
          </button>

          {menu.length > 0 && (
            <button
              onClick={handleClearAllItems}
              className="flex items-center gap-1 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition cursor-pointer"
              title="Remove all items from menu"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Menu</span>
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item</span>
          </button>
        </div>
      </div>

      {/* Search Bar & Category Filter */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-[#8c7a72] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search menu items by name, category, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#fffbf5] pl-10 pr-4 py-2.5 rounded-2xl text-xs sm:text-sm text-[#2b2320] border border-[#eedecb] outline-hidden focus:ring-2 focus:ring-[#ea580c]"
          />
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[#ea580c] text-white shadow-xs'
                : 'bg-[#fffbf5] text-[#7d6e67] border border-[#eedecb] hover:bg-[#f4ebe1]'
            }`}
          >
            All Items ({menu.length})
          </button>
          {allCategories.map((cat) => {
            const count = menu.filter((m) => m.category.toLowerCase() === cat.toLowerCase()).length;
            if (count === 0 && selectedCategory !== cat) return null;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#ea580c] text-white shadow-xs'
                    : 'bg-[#fffbf5] text-[#7d6e67] border border-[#eedecb] hover:bg-[#f4ebe1]'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Menu List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((item) => (
          <div
            key={item.id}
            className={`p-3.5 rounded-2xl border transition bg-white flex flex-col justify-between hover:shadow-sm ${
              item.isAvailable
                ? 'border-[#eedecb]'
                : 'border-stone-200 bg-stone-50/70 opacity-80'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{item.imageEmoji || '☕'}</span>
                  {/* Veg / Non-Veg Badge */}
                  <span
                    className={`w-4 h-4 rounded-xs border flex items-center justify-center shrink-0 ${
                      item.isVeg ? 'border-emerald-600 bg-emerald-50' : 'border-rose-600 bg-rose-50'
                    }`}
                    title={item.isVeg ? 'Pure Veg' : 'Non-Veg'}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        item.isVeg ? 'bg-emerald-600' : 'bg-rose-600'
                      }`}
                    />
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {item.popular && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 flex items-center gap-0.5">
                      <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                      <span>Popular</span>
                    </span>
                  )}
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#f5ede0] text-[#7d6e67]">
                    {item.category}
                  </span>
                </div>
              </div>

              <div className="flex items-start justify-between gap-2">
                <h4
                  onClick={() => handleOpenEditModal(item)}
                  className="font-bold text-sm text-[#2b2320] hover:text-[#ea580c] cursor-pointer transition flex items-center gap-1"
                  title="Click to edit item"
                >
                  <span>{item.name}</span>
                </h4>
              </div>

              {item.description ? (
                <p className="text-[11px] text-[#7d6e67] line-clamp-2 mt-1">
                  {item.description}
                </p>
              ) : (
                <p className="text-[11px] text-stone-400 italic mt-1">No description</p>
              )}
            </div>

            <div className="mt-3 pt-2.5 border-t border-[#f2e6d7] flex items-center justify-between gap-2">
              {/* Price / Inline Edit */}
              {editingItemId === item.id ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-[#ea580c]">₹</span>
                  <input
                    type="number"
                    value={editPrice}
                    onChange={(e) => setEditPrice(Number(e.target.value))}
                    className="w-16 px-1.5 py-0.5 text-xs font-bold bg-[#f4ebe1] rounded border border-[#eedecb] outline-hidden"
                    autoFocus
                  />
                  <button
                    onClick={() => handleSavePrice(item.id)}
                    className="p-1 bg-emerald-600 text-white rounded cursor-pointer hover:bg-emerald-700"
                    title="Save price"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setEditingItemId(null)}
                    className="p-1 bg-stone-200 text-stone-600 rounded cursor-pointer hover:bg-stone-300"
                    title="Cancel"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEditingItemId(item.id);
                    setEditPrice(item.price);
                  }}
                  className="flex items-center gap-1 font-extrabold text-sm sm:text-base text-[#ea580c] hover:opacity-85 cursor-pointer"
                  title="Click to quick-edit price"
                >
                  <span>₹{item.price.toFixed(0)}</span>
                  <Edit2 className="w-3 h-3 opacity-60" />
                </button>
              )}

              {/* Action Buttons: Edit All Fields, In-Stock Toggle & Delete */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => handleOpenEditModal(item)}
                  className="px-2 py-1 bg-[#f4ebe1] hover:bg-[#ea580c] hover:text-white text-[#7d6e67] rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  title="Edit all fields (name, category, price, veg/non-veg, description, etc.)"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>

                <button
                  onClick={() => toggleAvailability(item)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    item.isAvailable
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                  }`}
                  title={item.isAvailable ? 'Click to mark Out of Stock' : 'Click to mark In Stock'}
                >
                  {item.isAvailable ? 'In Stock' : 'Out'}
                </button>

                <button
                  onClick={() => handleDeleteItem(item)}
                  className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                  title="Delete this dish from menu"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full bg-[#fffbf5] rounded-3xl border border-[#eedecb] p-8 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-[#f4ebe1] text-[#ea580c] flex items-center justify-center mb-3">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-[#2b2320]">
              {menu.length === 0 ? 'No Menu Items Yet' : 'No Matching Items Found'}
            </h3>
            <p className="text-xs text-[#7d6e67] max-w-sm mt-1 mb-4">
              {menu.length === 0
                ? 'Your menu is currently empty. Add your dishes manually or snap a picture of your paper menu to digitize it with AI.'
                : `No dishes match your search "${search}" in "${selectedCategory === 'all' ? 'All Categories' : selectedCategory}".`}
            </p>
            {menu.length === 0 ? (
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Dish Manually</span>
                </button>
                <button
                  onClick={() => setShowScannerModal(true)}
                  className="px-4 py-2 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Camera className="w-4 h-4" />
                  <span>Scan Menu Photo (AI)</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('all');
                }}
                className="px-3.5 py-1.5 bg-[#f4ebe1] text-[#7d6e67] hover:bg-[#eedecb] rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Clear Search & Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Edit Item Modal (Update Every Field) */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-[#eedecb] max-h-[92vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#eedecb]">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#f4ebe1] text-[#ea580c] flex items-center justify-center text-xl shrink-0">
                  {editEmoji || '☕'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#2b2320]">Edit Menu Item</h3>
                  <p className="text-xs text-[#7d6e67]">Update name, category, price, and all details</p>
                </div>
              </div>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-[#f4ebe1] rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditItem} className="space-y-3.5 text-xs">
              {/* Item Name */}
              <div>
                <label className="font-bold text-[#2b2320] block mb-1">
                  Item Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Caramel Macchiato"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[#f4ebe1] px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold outline-hidden border border-[#eedecb] focus:ring-2 focus:ring-[#ea580c] focus:bg-white transition"
                />
              </div>

              {/* Category & Price */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#2b2320] block mb-1">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={isCustomCategory ? '__CUSTOM__' : editCategory}
                    onChange={(e) => {
                      if (e.target.value === '__CUSTOM__') {
                        setIsCustomCategory(true);
                      } else {
                        setIsCustomCategory(false);
                        setEditCategory(e.target.value);
                      }
                    }}
                    className="w-full bg-[#f4ebe1] px-3 py-2.5 rounded-xl text-xs outline-hidden border border-[#eedecb] focus:ring-2 focus:ring-[#ea580c] focus:bg-white transition"
                  >
                    {allCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__CUSTOM__">➕ Enter New Category...</option>
                  </select>

                  {isCustomCategory && (
                    <input
                      type="text"
                      placeholder="Type custom category..."
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      autoFocus
                      className="mt-2 w-full bg-[#f4ebe1] px-3 py-2 rounded-xl text-xs outline-hidden border border-[#ea580c] focus:bg-white transition"
                    />
                  )}
                </div>

                <div>
                  <label className="font-bold text-[#2b2320] block mb-1">
                    Price (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-[#ea580c] text-sm">₹</span>
                    <input
                      type="number"
                      required
                      min="1"
                      step="1"
                      value={editItemPrice}
                      onChange={(e) => setEditItemPrice(Number(e.target.value))}
                      className="w-full bg-[#f4ebe1] pl-8 pr-3 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold outline-hidden border border-[#eedecb] focus:ring-2 focus:ring-[#ea580c] focus:bg-white transition"
                    />
                  </div>
                </div>
              </div>

              {/* Food Preference & Popular Toggle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#2b2320] block mb-1">Food Preference</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditIsVeg(true)}
                      className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                        editIsVeg
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                          : 'bg-[#f4ebe1] border-transparent text-[#7d6e67] hover:bg-[#ede0d2]'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                      <span>Pure Veg</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditIsVeg(false)}
                      className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                        !editIsVeg
                          ? 'bg-rose-50 border-rose-500 text-rose-800'
                          : 'bg-[#f4ebe1] border-transparent text-[#7d6e67] hover:bg-[#ede0d2]'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                      <span>Non-Veg</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-[#2b2320] block mb-1">Special Badge</label>
                  <button
                    type="button"
                    onClick={() => setEditPopular(!editPopular)}
                    className={`w-full py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                      editPopular
                        ? 'bg-amber-50 border-amber-400 text-amber-800'
                        : 'bg-[#f4ebe1] border-transparent text-[#7d6e67] hover:bg-[#ede0d2]'
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${editPopular ? 'fill-amber-500 text-amber-500' : ''}`} />
                    <span>{editPopular ? 'Popular / Best Seller' : 'Regular Item'}</span>
                  </button>
                </div>
              </div>

              {/* Stock Status */}
              <div>
                <label className="font-bold text-[#2b2320] block mb-1">Stock Availability</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditIsAvailable(true)}
                    className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                      editIsAvailable
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-[#f4ebe1] text-[#7d6e67] border-transparent hover:bg-[#ede0d2]'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>In Stock (Available)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditIsAvailable(false)}
                    className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                      !editIsAvailable
                        ? 'bg-stone-700 text-white border-stone-700 shadow-xs'
                        : 'bg-[#f4ebe1] text-[#7d6e67] border-transparent hover:bg-[#ede0d2]'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Out of Stock</span>
                  </button>
                </div>
              </div>

              {/* Emoji Icon Picker */}
              <div>
                <label className="font-bold text-[#2b2320] block mb-1">Emoji Icon</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editEmoji}
                    onChange={(e) => setEditEmoji(e.target.value)}
                    className="w-14 text-center text-xl bg-[#f4ebe1] py-2 rounded-xl border border-[#eedecb] outline-hidden focus:bg-white"
                  />
                  <div className="flex-1 flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1 bg-[#fdf9f4] rounded-xl border border-[#eedecb]">
                    {COMMON_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setEditEmoji(em)}
                        className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition cursor-pointer ${
                          editEmoji === em ? 'bg-[#ea580c] text-white scale-110 shadow-xs' : 'hover:bg-[#f4ebe1]'
                        }`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="font-bold text-[#2b2320] block mb-1">Description / Recipe Note</label>
                <textarea
                  rows={2}
                  placeholder="Ingredients, preparation details, or serving notes..."
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full bg-[#f4ebe1] px-3 py-2 rounded-xl text-xs outline-hidden border border-[#eedecb] focus:ring-2 focus:ring-[#ea580c] focus:bg-white transition"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2 border-t border-[#eedecb]">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="flex-1 py-2.5 rounded-xl bg-[#f4ebe1] text-[#7d6e67] font-semibold hover:bg-[#ede0d2] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-[#eedecb] max-h-[92vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#eedecb]">
              <div>
                <h3 className="text-base font-bold text-[#2b2320]">Add Menu Item</h3>
                <p className="text-xs text-[#7d6e67]">Create a new dish or beverage for this cafe</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-[#f4ebe1] rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewItem} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-[#2b2320] block mb-1">
                  Item Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Caramel Macchiato"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full bg-[#f4ebe1] px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold outline-hidden border border-[#eedecb] focus:ring-2 focus:ring-[#ea580c] focus:bg-white transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#2b2320] block mb-1">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={newIsCustomCategory ? '__CUSTOM__' : newItemCategory}
                    onChange={(e) => {
                      if (e.target.value === '__CUSTOM__') {
                        setNewIsCustomCategory(true);
                      } else {
                        setNewIsCustomCategory(false);
                        setNewItemCategory(e.target.value);
                      }
                    }}
                    className="w-full bg-[#f4ebe1] px-3 py-2.5 rounded-xl text-xs outline-hidden border border-[#eedecb] focus:ring-2 focus:ring-[#ea580c] focus:bg-white transition"
                  >
                    {allCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__CUSTOM__">➕ Enter New Category...</option>
                  </select>

                  {newIsCustomCategory && (
                    <input
                      type="text"
                      placeholder="Type new category..."
                      value={newCustomCategory}
                      onChange={(e) => setNewCustomCategory(e.target.value)}
                      autoFocus
                      className="mt-2 w-full bg-[#f4ebe1] px-3 py-2 rounded-xl text-xs outline-hidden border border-[#ea580c] focus:bg-white transition"
                    />
                  )}
                </div>

                <div>
                  <label className="font-bold text-[#2b2320] block mb-1">
                    Price (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-[#ea580c] text-sm">₹</span>
                    <input
                      type="number"
                      required
                      min="1"
                      step="1"
                      value={newItemPrice}
                      onChange={(e) => setNewItemPrice(Number(e.target.value))}
                      className="w-full bg-[#f4ebe1] pl-8 pr-3 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold outline-hidden border border-[#eedecb] focus:ring-2 focus:ring-[#ea580c] focus:bg-white transition"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#2b2320] block mb-1">Food Preference</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewItemIsVeg(true)}
                      className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                        newItemIsVeg
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                          : 'bg-[#f4ebe1] border-transparent text-[#7d6e67] hover:bg-[#ede0d2]'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                      <span>Pure Veg</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewItemIsVeg(false)}
                      className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                        !newItemIsVeg
                          ? 'bg-rose-50 border-rose-500 text-rose-800'
                          : 'bg-[#f4ebe1] border-transparent text-[#7d6e67] hover:bg-[#ede0d2]'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                      <span>Non-Veg</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-[#2b2320] block mb-1">Special Badge</label>
                  <button
                    type="button"
                    onClick={() => setNewItemPopular(!newItemPopular)}
                    className={`w-full py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                      newItemPopular
                        ? 'bg-amber-50 border-amber-400 text-amber-800'
                        : 'bg-[#f4ebe1] border-transparent text-[#7d6e67] hover:bg-[#ede0d2]'
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${newItemPopular ? 'fill-amber-500 text-amber-500' : ''}`} />
                    <span>{newItemPopular ? 'Popular / Best Seller' : 'Regular Item'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-[#2b2320] block mb-1">Emoji Icon</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newItemEmoji}
                    onChange={(e) => setNewItemEmoji(e.target.value)}
                    className="w-14 text-center text-xl bg-[#f4ebe1] py-2 rounded-xl border border-[#eedecb] outline-hidden focus:bg-white"
                  />
                  <div className="flex-1 flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1 bg-[#fdf9f4] rounded-xl border border-[#eedecb]">
                    {COMMON_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setNewItemEmoji(em)}
                        className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition cursor-pointer ${
                          newItemEmoji === em ? 'bg-[#ea580c] text-white scale-110 shadow-xs' : 'hover:bg-[#f4ebe1]'
                        }`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="font-bold text-[#2b2320] block mb-1">Short Description</label>
                <textarea
                  rows={2}
                  placeholder="Ingredients or preparation note..."
                  value={newItemDesc}
                  onChange={(e) => setNewItemDesc(e.target.value)}
                  className="w-full bg-[#f4ebe1] px-3 py-2 rounded-xl text-xs outline-hidden border border-[#eedecb] focus:ring-2 focus:ring-[#ea580c] focus:bg-white transition"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-[#eedecb]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-[#f4ebe1] text-[#7d6e67] font-semibold hover:bg-[#ede0d2] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Dish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Photo Scanner Modal */}
      {showScannerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-white rounded-3xl p-5 shadow-2xl border border-[#eedecb] max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#eedecb]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#2b2320]">
                    AI Menu Digitizer
                  </h3>
                  <p className="text-[11px] text-[#7d6e67]">
                    Upload a photo of your paper menu, chalkboard, or flyer to auto-extract all items
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowScannerModal(false)}
                className="p-1 rounded-full text-[#7d6e67] hover:bg-[#f4ebe1] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 py-3 space-y-3">
              {/* Image Input Box */}
              <div className="border-2 border-dashed border-[#eedecb] rounded-2xl p-4 text-center bg-[#fffbf5] flex flex-col items-center justify-center">
                {imagePreview ? (
                  <div className="space-y-2 w-full flex flex-col items-center">
                    <img
                      src={imagePreview}
                      alt="Menu Upload Preview"
                      className="max-h-48 rounded-xl object-contain border border-[#eedecb] shadow-xs"
                    />
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#f4ebe1] hover:bg-[#eedecb] text-[#2b2320] text-xs font-semibold cursor-pointer">
                      <Camera className="w-3.5 h-3.5" />
                      <span>Choose Different Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                ) : (
                  <label className="cursor-pointer space-y-2 flex flex-col items-center py-4">
                    <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="font-bold text-sm text-[#2b2320] block">
                        Upload or snap a photo of your menu
                      </span>
                      <span className="text-[11px] text-[#7d6e67] block">
                        Supports JPEG, PNG, WEBP (Paper menu, rate card, blackboard)
                      </span>
                    </div>
                    <span className="px-3.5 py-1.5 bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-xl text-xs font-bold transition">
                      Browse File
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {scanError && (
                <div className="p-3 bg-rose-50 text-rose-800 rounded-xl border border-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{scanError}</span>
                </div>
              )}

              {/* Action trigger */}
              {imagePreview && scannedItems.length === 0 && (
                <button
                  onClick={handleStartScan}
                  disabled={isScanning}
                  className="w-full py-2.5 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Gemini Vision is analyzing menu dishes & prices...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Extract Menu Items with AI</span>
                    </>
                  )}
                </button>
              )}

              {/* Extracted items results */}
              {scannedItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#2b2320]">
                      Detected {scannedItems.length} Dishes
                    </span>
                    <button
                      onClick={() => {
                        if (selectedScanIndexes.length === scannedItems.length) {
                          setSelectedScanIndexes([]);
                        } else {
                          setSelectedScanIndexes(scannedItems.map((_, i) => i));
                        }
                      }}
                      className="text-purple-700 font-bold hover:underline"
                    >
                      {selectedScanIndexes.length === scannedItems.length
                        ? 'Deselect All'
                        : 'Select All'}
                    </button>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1.5 border border-[#eedecb] rounded-2xl p-2 bg-[#fffbf5]">
                    {scannedItems.map((item, idx) => {
                      const isChecked = selectedScanIndexes.includes(idx);
                      return (
                        <label
                          key={idx}
                          className={`flex items-center justify-between p-2 rounded-xl border transition text-xs cursor-pointer ${
                            isChecked
                              ? 'bg-purple-50/60 border-purple-300'
                              : 'bg-white border-stone-200 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setSelectedScanIndexes((prev) =>
                                    prev.filter((i) => i !== idx)
                                  );
                                } else {
                                  setSelectedScanIndexes((prev) => [...prev, idx]);
                                }
                              }}
                              className="accent-purple-600 rounded"
                            />
                            <span className="text-base">{item.imageEmoji || '🍽️'}</span>
                            <div className="min-w-0">
                              <span className="font-bold text-[#2b2320] block truncate">
                                {item.name}
                              </span>
                              <span className="text-[10px] text-[#7d6e67]">
                                {item.category} {item.isVeg ? '• Veg' : '• Non-Veg'}
                              </span>
                            </div>
                          </div>
                          <span className="font-extrabold text-[#ea580c] shrink-0">
                            ₹{item.price}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-[#eedecb] flex gap-2">
              <button
                type="button"
                onClick={() => setShowScannerModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#f4ebe1] text-[#7d6e67] font-semibold text-xs"
              >
                Close
              </button>
              {scannedItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleImportScannedItems}
                  disabled={isImporting || selectedScanIndexes.length === 0}
                  className="flex-1 py-2.5 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold text-xs disabled:opacity-40 transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Adding to Menu...</span>
                    </>
                  ) : (
                    <span>Add {selectedScanIndexes.length} Dishes to Menu</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
