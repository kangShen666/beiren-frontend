// stores/viewportStore.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useViewportStore = defineStore('viewport', () => {
  const isSpecialViewport = ref(false);

  const updateViewport = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const currentResolution = `${width}x${height}`;
    const SPECIAL_RESOLUTIONS_MAP: any = {
      "11520x2160": true,
      "5760x1080": true,//驾驶舱
      "5752x1076": true, //驾驶舱
      "7640x2160": 2,
      "5120x960": 3, // 北人三连屏
      "3840x1080": 4, // 财富中心18楼
      "3840x1079": 4, // 财富中心18楼
    };
    isSpecialViewport.value = currentResolution in SPECIAL_RESOLUTIONS_MAP ? SPECIAL_RESOLUTIONS_MAP[currentResolution] : false;
  };

  updateViewport();
  window.addEventListener('resize', updateViewport);

  return { isSpecialViewport };
});
