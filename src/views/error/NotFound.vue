<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
/**
 * @goHome 返回到首页
 */
const goHome = () => router.replace({ path: '/MainHome' })
</script>

<template>
  <div class="error-container">
    <img src="@/assets/svg/svg/not-found.svg" width="420" height="500" alt="404">
    <button class="error-button" @click="goHome">返回首页</button>
  </div>
</template>

<style scoped>
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: #f5f7fa;
  padding: 20px;
  box-sizing: border-box;
}

.error-button {
  padding: 10px 20px;
  font-size: 14px;
  color: white;
  background-color: #4e7df1;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.error-button:hover {
  background-color: #3c66d1;
}
</style>
