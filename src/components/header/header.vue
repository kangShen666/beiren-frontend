<script setup lang="ts">
// 可选：如果需要动态计算rem基准值，可以在这里添加
import { onMounted } from 'vue';

onMounted(() => {
  // 可选：设置rem基准值 (1rem = 100px 便于计算)
  const setRemBase = () => {
    const html = document.documentElement;
    const fontSize = Math.min(html.clientWidth / 19.2, 100); // 以1920px为基准
    html.style.fontSize = `${fontSize}px`;
  };

  setRemBase();
  window.addEventListener('resize', setRemBase);

  return () => {
    window.removeEventListener('resize', setRemBase);
  };
});
</script>

<template>
  <div class="viewport">
    <h3>会展中心</h3>
    <!-- <h3>北人亦创国际会展中心</h3> -->
  </div>
</template>

<style scoped lang="less">
// 基础样式
.viewport {
  width: 100vw;
  height: 1.2rem; // 保持原有rem单位
  background: url('../../assets/img/header.png') no-repeat;
  background-size: 100% 100%;
  /* 强制拉伸填充，可能变形 */
  background-repeat: no-repeat !important;
  position: relative; // 为绝对定位的h3提供定位上下文

  h3 {
    font-size: 0.5rem; // 50px -> 0.5rem (基于1rem=100px)
    text-align: center;
    color: #fff;
    line-height: 1rem; // 100px -> 1rem
    letter-spacing: 0.0625rem; // 0.625px -> 0.0625rem
    padding-left: 0.125rem; // 1.25px -> 0.125rem
    margin: 0; // 清除默认margin
  }
}

// 超高清大屏 (11520x2160)
@media screen and (width: 11520px) and (height: 2160px) {
  .viewport {
    height: 2rem; // 30px -> 0.3rem
    position: relative; // 确保定位上下文

    h3 {
      font-size: 0.9rem; // 90px -> 0.9rem
      line-height: 1rem; // 保持1rem
      letter-spacing: 0.0625rem;
      padding-left: 0.125rem;
      position: absolute;
      left: 47%;
      top: -6%;
      transform: translateY(50%); // 优化垂直居中
    }
  }
}

// 1080P屏幕 (1920x1080)
@media screen and (width: 1920px) and (height: 1080px) {
  .viewport {
    h3 {
      font-size: 0.35rem; // 35px -> 0.35rem
    }
  }
}

// 特殊屏幕 (1920x953)
@media screen and (width: 1920px) and (height: 953px) {
  .viewport {
    h3 {
      font-size: 0.35rem; // 35px -> 0.35rem
    }
  }
}

// 可选：添加更多响应式断点适配不同屏幕
@media screen and (max-width: 1920px) {
  .viewport {
    h3 {
      font-size: calc(0.3rem + 0.2vw); // 动态适配
    }
  }
}

// 移动端适配（可选）
@media screen and (max-width: 768px) {
  .viewport {
    height: 1rem;

    h3 {
      font-size: 0.3rem;
      line-height: 1rem;
      letter-spacing: 0.03rem;
    }
  }
}
</style>