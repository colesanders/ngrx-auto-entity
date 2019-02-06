export interface IPage {
  page: number;
  size: number;
}

export type Page = IPage;

export interface IPageInfo {
  page: Page;
  totalCount: number;
}
