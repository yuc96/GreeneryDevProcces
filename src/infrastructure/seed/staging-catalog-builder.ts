import stagingsData from "@/data/staggings-list.json";

export interface StagingCatalogMongoDoc {
  _id: number;
  name: string;
  description: string;
  image: string;
  providers: Array<{ name: string; price: number }>;
}

export function buildStagingCatalogDocuments(): StagingCatalogMongoDoc[] {
  const data = stagingsData as {
    stagings: Array<{
      id: number;
      name: string;
      description: string;
      image: string;
      providers: Array<{ name: string; price: number }>;
    }>;
  };
  return data.stagings.map((s) => ({
    _id: s.id,
    name: s.name,
    description: s.description,
    image: s.image,
    providers: s.providers,
  }));
}
