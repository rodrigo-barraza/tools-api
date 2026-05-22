/**
 * Health Domain TypeScript Definitions
 */

export interface FoodItem {
  food_name: string;
  description_long: string;
  food_keywords?: string;
  food_type: string;
  food_subtype?: string;
  food_part?: string;
  food_form?: string;
  food_state?: string;
  food_region?: string;
  _source?: string;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  suborder?: string;
  family?: string;
  subfamily?: string;
  tribe?: string;
  genus?: string;
  species?: string;
  subspecies?: string;
  variety?: string;
  form?: string;
  group?: string;
  cultivar?: string;
  phenotype?: string;
  binomial?: string;
  nomial?: string;
  trinomial?: string;
  taxon?: string;
  kilocalories?: number | null;
  kilojoules?: number | null;
  protein?: number | null;
  lipid?: number | null;
  carbohydrate?: number | null;
  fiber?: number | null;
  calcium?: number | null;
  iron?: number | null;
  magnesium?: number | null;
  potassium?: number | null;
  zinc?: number | null;
  ascorbic_acid?: number | null;
  vitamin_b6?: number | null;
  folate_total?: number | null;
  cyanocobalamin?: number | null;
  vitamin_a_rae?: number | null;
  vitamin_d?: number | null;
  alpha_tocopherol?: number | null;
  thiamin?: number | null;
  riboflavin?: number | null;
  niacin?: number | null;
  c22_d6_n3_dha?: number | null;
  [key: string]: string | string[] | number | null | undefined;
}

export interface Exercise {
  id: string;
  name: string;
  category: string;
  equipment: string;
  force: string;
  level: string;
  mechanic: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  _source: string;
  [key: string]: string | string[] | undefined;
}

export interface DrugProduct {
  productNdc: string;
  genericName: string;
  brandName: string;
  labelerName: string;
  dosageForm: string;
  route: string;
  productType: string;
  marketingCategory: string;
  activeIngredients: string;
  pharmClass: string;
}

export interface RawDrugRow {
  product_ndc: string | null;
  generic_name: string | null;
  brand_name: string | null;
  labeler_name: string | null;
  dosage_form: string | null;
  route: string | null;
  product_type: string | null;
  marketing_category: string | null;
  active_ingredients: string | null;
  pharm_class: string | null;
  [key: string]: string | null;
}
