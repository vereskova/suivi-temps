// Кто работает с VOLDIS: « Location de locaux / Аренда локалей » (План, Месяц, Банк, Настройки) и Ajax.
// rh_admin и бухгалтер (comptable) - полный доступ, включая подтверждение банка, напоминания, счета.
// Держать в синхроне с RLS-политиками (миграции 0115/0118/0123 + 0148_voldis_comptable_access).
export const VOLDIS_LOCATION_ROLES = ["rh_admin", "comptable"] as const;
export const VOLDIS_AJAX_ROLES = ["rh_admin", "comptable"] as const;
