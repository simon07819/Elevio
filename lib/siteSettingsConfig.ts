export type SiteSetting = {
  key: string;
  value: string;
  label: string;
  updated_at: string | null;
};

/** Keys that the superadmin can edit */
export const EDITABLE_SETTINGS: Array<{ key: string; label: string; defaultValue: string }> = [
  // ── Support content ──────────────────────────────────────────────
  { key: "support_email", label: "Courriel support", defaultValue: "support@elevio.app" },
  { key: "support_phone", label: "Téléphone support", defaultValue: "" },
  { key: "support_hours", label: "Heures de support", defaultValue: "Lun-Ven 8h-18h" },
  { key: "support_passenger_text", label: "Texte section passager", defaultValue: "" },
  { key: "support_operator_text", label: "Texte section opérateur", defaultValue: "" },
  { key: "support_faq_json", label: "FAQ (JSON: [{q,a}])", defaultValue: "[]" },
  { key: "support_safety_text", label: "Texte section sécurité", defaultValue: "" },
  { key: "support_data_text", label: "Texte section données", defaultValue: "" },
  { key: "support_liability_text", label: "Texte section responsabilité", defaultValue: "" },
  // ── Support content (EN) ─────────────────────────────────────────
  { key: "support_passenger_text_en", label: "Passenger section text (EN)", defaultValue: "" },
  { key: "support_operator_text_en", label: "Operator section text (EN)", defaultValue: "" },
  { key: "support_faq_json_en", label: "FAQ EN (JSON: [{q,a}])", defaultValue: "" },
  { key: "support_safety_text_en", label: "Safety section text (EN)", defaultValue: "" },
  { key: "support_data_text_en", label: "Data section text (EN)", defaultValue: "" },
  { key: "support_liability_text_en", label: "Liability section text (EN)", defaultValue: "" },
  // ── Support content (ES) ─────────────────────────────────────────
  { key: "support_passenger_text_es", label: "Texto sección pasajero (ES)", defaultValue: "" },
  { key: "support_operator_text_es", label: "Texto sección operador (ES)", defaultValue: "" },
  { key: "support_faq_json_es", label: "FAQ ES (JSON: [{q,a}])", defaultValue: "" },
  { key: "support_safety_text_es", label: "Texto sección seguridad (ES)", defaultValue: "" },
  { key: "support_data_text_es", label: "Texto sección datos (ES)", defaultValue: "" },
  { key: "support_liability_text_es", label: "Texto sección responsabilidad (ES)", defaultValue: "" },
  { key: "help_app_text", label: "Texte aide dans l'app", defaultValue: "" },
  { key: "contact_enterprise_message", label: "Message contact enterprise", defaultValue: "Décrivez votre projet et nous vous recontacterons sous 24h." },
  // ── Legal content ────────────────────────────────────────────────
  { key: "legal_privacy_url", label: "URL politique confidentialité", defaultValue: "/legal/privacy" },
  { key: "legal_terms_url", label: "URL conditions d'utilisation", defaultValue: "/legal/terms" },
  { key: "privacy_content", label: "Contenu politique confidentialité (JSON sections)", defaultValue: "" },
  { key: "terms_content", label: "Contenu conditions d'utilisation (JSON sections)", defaultValue: "" },
  { key: "privacy_content_en", label: "Privacy content EN (JSON sections)", defaultValue: "" },
  { key: "terms_content_en", label: "Terms content EN (JSON sections)", defaultValue: "" },
  { key: "privacy_content_es", label: "Contenido privacidad ES (JSON secciones)", defaultValue: "" },
  { key: "terms_content_es", label: "Contenido condiciones ES (JSON secciones)", defaultValue: "" },
  { key: "safety_notice", label: "Avis sécurité chantier", defaultValue: "" },
  { key: "liability_notice", label: "Avis limitation de responsabilité", defaultValue: "" },
  { key: "data_collection_notice", label: "Avis collecte de données", defaultValue: "" },
  // ── Platform config ──────────────────────────────────────────────
  { key: "maintenance_message", label: "Message maintenance (vide = aucun)", defaultValue: "" },
  { key: "global_message", label: "Message global (vide = aucun)", defaultValue: "" },
  { key: "product_name", label: "Nom du produit", defaultValue: "Elevio" },
  { key: "site_url", label: "URL du site", defaultValue: "" },
  { key: "footer_text", label: "Texte footer", defaultValue: "© Elevio — Gestion intelligente d'ascenseurs de chantier" },
  { key: "cta_label", label: "Texte bouton CTA principal", defaultValue: "Commencer" },
  { key: "cta_url", label: "URL bouton CTA principal", defaultValue: "/scan" },
];
