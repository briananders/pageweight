import { formatBytes, parseSizeString, truncateUrl } from './classify.ts';
import { calculateTotalSize } from './formatters.ts';
import type {
  Asset,
  Budgets,
  BudgetRuleKey,
  BudgetValue,
  BudgetViolation,
  GroupBudgetKey,
  ResourceType,
} from './types.ts';

const TYPE_KEY_MAP: Record<GroupBudgetKey, ResourceType> = {
  image: 'Image',
  media: 'Media',
  script: 'Script',
  stylesheet: 'Stylesheet',
  font: 'Font',
  document: 'Document',
  json: 'JSON',
  xml: 'XML',
  text: 'Text',
  other: 'Other',
};

const GROUP_BUDGET_KEYS: readonly GroupBudgetKey[] = [
  'image',
  'media',
  'script',
  'stylesheet',
  'font',
  'document',
  'json',
  'xml',
  'text',
  'other',
];

const VIOLATION_URL_MAX_LENGTH = 60;

/**
 * Check whether the combined weight of all assets exceeds the overall total budget.
 */
function checkTotalBudget(
  assets: readonly Asset[],
  budgetValue: BudgetValue
): BudgetViolation | null {
  const limit = parseSizeString(budgetValue);
  const actual = calculateTotalSize(assets);

  if (actual > limit) {
    return {
      rule: 'total',
      message: `Total page weight ${formatBytes(actual)} exceeds budget of ${formatBytes(limit)}`,
      actual,
      budget: limit,
    };
  }

  return null;
}

/**
 * Check all configured per-resource-type group budgets against the asset list.
 */
function checkGroupBudgets(
  assets: readonly Asset[],
  budgets: Budgets
): BudgetViolation[] {
  const violations: BudgetViolation[] = [];

  for (const key of GROUP_BUDGET_KEYS) {
    const budgetValue = budgets[key];
    if (budgetValue === null || budgetValue === undefined) {
      continue;
    }

    const limit = parseSizeString(budgetValue);
    const typeName = TYPE_KEY_MAP[key];
    const groupAssets = assets.filter((asset) => asset.type === typeName);
    const actual = calculateTotalSize(groupAssets);

    if (actual > limit) {
      violations.push({
        rule: key,
        message: `${typeName} total ${formatBytes(actual)} exceeds budget of ${formatBytes(limit)}`,
        actual,
        budget: limit,
      });
    }
  }

  return violations;
}

/**
 * Check individual assets against a single-asset size ceiling.
 */
function checkSingleAssetBudget(
  assets: readonly Asset[],
  rule: Extract<BudgetRuleKey, 'perAsset' | 'perImage' | 'perMedia'>,
  budgetValue: BudgetValue,
  budgetLabel: string,
  requiredType?: ResourceType
): BudgetViolation[] {
  const limit = parseSizeString(budgetValue);
  const violations: BudgetViolation[] = [];

  for (const asset of assets) {
    if (requiredType && asset.type !== requiredType) {
      continue;
    }

    if (asset.size > limit) {
      const displayUrl = truncateUrl(asset.url, VIOLATION_URL_MAX_LENGTH);
      let prefix = `${asset.type} asset`;
      if (requiredType) {
        prefix = requiredType;
      }

      violations.push({
        rule,
        message: `${prefix} ${displayUrl} (${formatBytes(asset.size)}) exceeds ${budgetLabel} of ${formatBytes(limit)}`,
        actual: asset.size,
        budget: limit,
        asset,
      });
    }
  }

  return violations;
}

/**
 * Evaluate all configured total, per-group, and per-asset budgets and return every violation found.
 */
export function checkBudgets(
  assets: readonly Asset[],
  budgets?: Budgets | null
): BudgetViolation[] {
  if (!budgets || typeof budgets !== 'object') {
    return [];
  }

  const violations: BudgetViolation[] = [];

  if (budgets.total !== null && budgets.total !== undefined) {
    const totalViolation = checkTotalBudget(assets, budgets.total);
    if (totalViolation) {
      violations.push(totalViolation);
    }
  }

  violations.push(...checkGroupBudgets(assets, budgets));

  if (budgets.perAsset !== null && budgets.perAsset !== undefined) {
    violations.push(
      ...checkSingleAssetBudget(assets, 'perAsset', budgets.perAsset, 'per-asset budget')
    );
  }

  if (budgets.perImage !== null && budgets.perImage !== undefined) {
    violations.push(
      ...checkSingleAssetBudget(assets, 'perImage', budgets.perImage, 'per-image budget', 'Image')
    );
  }

  if (budgets.perMedia !== null && budgets.perMedia !== undefined) {
    violations.push(
      ...checkSingleAssetBudget(assets, 'perMedia', budgets.perMedia, 'per-media budget', 'Media')
    );
  }

  return violations;
}
