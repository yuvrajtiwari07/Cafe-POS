import { MenuItem } from '../types';

// Strict requirement: No default menu items. Menu starts completely empty until user adds items or uploads a menu photo.
export const STARTER_MENU: Omit<MenuItem, 'id' | 'cafeId'>[] = [];
