export type UrbanizationCreateDto = {
  name: string;
  maxUsers?: number;
  telegramGroupId?: string | null;
};

export type UrbanizationUpdateDto = {
  name?: string;
  maxUsers?: number;
  telegramGroupId?: string | null;
};
