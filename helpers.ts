import { promises as fs } from "fs";

export async function saveData(data: any[], filename: string): Promise<void> {
  const jsonData = JSON.stringify(data);
  await fs.writeFile(filename, jsonData, "utf8");
}

export async function loadData(filename: string): Promise<any[]> {
  const jsonData = await fs.readFile(filename, "utf8");
  return JSON.parse(jsonData);
}
