declare module "robots-parser" {
  export interface Robots {
    isAllowed(url: string, userAgent?: string): boolean;
  }

  export default function robotsParser(url: string, contents: string): Robots;
}
