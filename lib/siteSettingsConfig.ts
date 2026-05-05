export type SiteSetting = {
  key: string;
  value: string;
  label: string;
  updated_at: string | null;
};

/** Keys that the superadmin can edit */
export const EDITABLE_SETTINGS: Array<{ key: string; label: string; defaultValue: string }> = [
  { key: "support_email", label: "Courriel support", defaultValue: "support@elevio.app" },
  { key: "support_phone", label: "Téléphone support", defaultValue: "" },
  { key: "support_hours", label: "Heures de support", defaultValue: "Lun-Ven 8h-18h" },
  { key: "faq_content", label: "FAQ (JSON: [{q,a}])", defaultValue: "[]" },
  { key: "help_app_text", label: "Texte aide dans l'app", defaultValue: "" },
  { key: "contact_enterprise_message", label: "Message contact enterprise", defaultValue: "Décrivez votre projet et nous vous recontacterons sous 24h." },
  { key: "legal_privacy_url", label: "URL politique confidentialité", defaultValue: "/legal/privacy" },
  { key: "legal_terms_url", label: "URL conditions d'utilisation", defaultValue: "/legal/terms" },
  { key: "maintenance_message", label: "Message maintenance (vide = aucun)", defaultValue: "" },
  { key: "global_message", label: "Message global (vide = aucun)", defaultValue: "" },
  { key: "product_name", label: "Nom du produit", defaultValue: "Elevio" },
  { key: "site_url", label: "URL du site", defaultValue: "" },
  { key: "footer_text", label: "Texte footer", defaultValue: "© Elevio — Gestion intelligente d'ascenseurs de chantier" },
  { key: "cta_label", label: "Texte bouton CTA principal", defaultValue: "Commencer" },
  { key: "cta_url", label: "URL bouton CTA principal", defaultValue: "/scan" },
];
