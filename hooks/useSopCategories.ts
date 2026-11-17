import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { DEFAULT_SOP_CATEGORIES, sopColorStyle, type SopCategoryDef } from '@/lib/resources';

/** Loads the owner-managed SOP category list (falls back to defaults if the request fails). */
export function useSopCategories(enabled = true) {
  const [categories, setCategories] = useState<SopCategoryDef[]>(DEFAULT_SOP_CATEGORIES);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const rows = await apiClient.listSopCategories();
      setCategories(rows);
    } catch {
      /* keep whatever we have */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  const find = useCallback(
    (slug: string | null | undefined) => categories.find((c) => c.slug === slug) || null,
    [categories]
  );

  const labelFor = useCallback((slug: string | null | undefined) => find(slug)?.label ?? '', [find]);
  const styleFor = useCallback((slug: string | null | undefined) => sopColorStyle(find(slug)?.color), [find]);

  return { categories, loaded, reload, labelFor, styleFor };
}
