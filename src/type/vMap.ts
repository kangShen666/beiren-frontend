// 定义热点数据的类型接口
export interface HotspotEntity {
  id: string;
  name: string;
  lat: string;
  lon: string;
  height?: string;
  url: string;
  img:string;
  wsUrl: string;
  category: string;
  subCategory: number;
   duankouhao: {
    ip: string;
    admin: string;
    password: string;
    yuzhiwei: number;
  };
  coords: number[][];
}

export interface TreePoint {
  id: number;
  category: number;
  subCategory: number;
  name: string;
  lat: number;
  lon: number;
  url: string;
}
