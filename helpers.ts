import fs from "fs";
import path from "path";

export async function saveData(data: any, filename: string): Promise<void> {
  const filePath = path.resolve(__dirname, filename);
  try {
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving file ${filePath}:`, error);
    throw error;
  }
}

export async function loadData(filename: string): Promise<any> {
  const filePath = path.resolve(__dirname, filename);
  try {
    const data = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading file ${filePath}:`, error);
    throw error;
  }
}

export function delay(time: number) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

export function containsExactMatch(text: string, search: string): boolean {
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escapedSearch}\\b`);
  return pattern.test(text);
}
