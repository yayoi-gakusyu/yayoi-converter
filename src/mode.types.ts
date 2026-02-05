
import { AppMode } from './types';

export interface ModeConfig {
  mode: AppMode;
  label: string;
  icon: string;
  accentColor: string;
  gradientFrom: string;
  gradientTo: string;
  bgLight: string;
  bgLightHex: string;
  borderLight: string;
  tabIcon: string;
  headerTitle: string;
  headerSubtitle: string;
  csvFilenamePart: string;
  uploadIcon: string;
  uploadText: string;
  loadingText: string;
  hasCardSelection: boolean;
  hasBankSelection: boolean;
  hasInvoiceNumber: boolean;
  hasIncomeRules: boolean;
  hasTypeColumn: boolean;
  storagePrefix: string;
}

export const MODE_CONFIGS: Record<AppMode, ModeConfig> = {
  creditcard: {
    mode: 'creditcard',
    label: 'クレカ明細',
    icon: '💳',
    accentColor: '#d97706',
    gradientFrom: '#d97706',
    gradientTo: '#b45309',
    bgLight: 'bg-amber-50',
    bgLightHex: '#fffbeb',
    borderLight: 'border-amber-100',
    tabIcon: '💳',
    headerTitle: '💳 クレカ明細 → 弥生CSV変換',
    headerSubtitle: 'クレジットカード明細のPDF・画像から弥生会計の未払金仕訳データを作成',
    csvFilenamePart: 'クレカ',
    uploadIcon: '💳',
    uploadText: 'クレカ明細のPDFまたは画像をここにドロップ',
    loadingText: 'AIがクレカ明細を読み取り中...',
    hasCardSelection: true,
    hasBankSelection: false,
    hasInvoiceNumber: false,
    hasIncomeRules: false,
    hasTypeColumn: false,
    storagePrefix: 'cc_',
  },
  bank: {
    mode: 'bank',
    label: '通帳',
    icon: '📄',
    accentColor: '#667eea',
    gradientFrom: '#667eea',
    gradientTo: '#764ba2',
    bgLight: 'bg-indigo-50',
    bgLightHex: '#eef2ff',
    borderLight: 'border-indigo-100',
    tabIcon: '📷',
    headerTitle: '📄 通帳 → 弥生CSV変換',
    headerSubtitle: '通帳の写真やPDFから弥生会計の仕訳データを作成',
    csvFilenamePart: '通帳',
    uploadIcon: '📷',
    uploadText: '通帳の写真またはPDFをここにドロップ',
    loadingText: 'AIが全ページを読み取り中...',
    hasCardSelection: false,
    hasBankSelection: true,
    hasInvoiceNumber: false,
    hasIncomeRules: true,
    hasTypeColumn: true,
    storagePrefix: 'bank_',
  },
  receipt: {
    mode: 'receipt',
    label: '領収書',
    icon: '🧾',
    accentColor: '#059669',
    gradientFrom: '#059669',
    gradientTo: '#047857',
    bgLight: 'bg-emerald-50',
    bgLightHex: '#ecfdf5',
    borderLight: 'border-emerald-100',
    tabIcon: '🧾',
    headerTitle: '🧾 領収書 → 弥生CSV変換',
    headerSubtitle: '領収書・レシートのPDF・画像から弥生会計の現金仕訳データを作成',
    csvFilenamePart: '現金',
    uploadIcon: '🧾',
    uploadText: '領収書・レシートのPDFまたは画像をここにドロップ',
    loadingText: 'AIが領収書・レシートを読み取り中...',
    hasCardSelection: false,
    hasBankSelection: false,
    hasInvoiceNumber: true,
    hasIncomeRules: false,
    hasTypeColumn: false,
    storagePrefix: 'rc_',
  }
};
