<script setup lang="ts">
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { onMounted, onUnmounted, reactive, ref,onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const loggedDateTime = ref('')
const loading = ref(false)

const updateDateTime = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const weekday = weekdays[now.getDay()]
  loggedDateTime.value = `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${weekday}`
}

onMounted(() => {
  updateDateTime()
  const intervalId = setInterval(updateDateTime, 1000)
  onUnmounted(() => {
    clearInterval(intervalId)
  })
})
onBeforeUnmount(() => {
 sessionStorage.removeItem('auth_token');
})

const form = reactive({
  username: "",
  password: "",
})

// 登录
const gologin = async () => {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }
  loading.value = true

  try {
    const response = await axios.post('/check', {
      username: form.username,
      password: form.password,
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    if (response.status == 200) {
      const { code, data } = response.data
      if (code == 200) {
        // 登录成功处理
        ElMessage.success('登录成功')
        
        // 生成假token（实际应用中应该由服务器返回）
        const fakeToken = `fake_token_${Date.now()}_${Math.random().toString(36).substr(2)}`
        
        // 存储token到localStorage和pinia/vuex（假设你使用这些）
        sessionStorage.setItem('auth_token', fakeToken)
        // 如果你使用pinia/vuex管理状态，也可以在这里更新状态
        // authStore.setToken(fakeToken)
        
        // 跳转到主页
        router.push('/MainHome')
      }
      else if (code === 216) {
        ElMessage.error('账号或密码错误')
      }
      else if (code === 404) {
        ElMessage.error('账号未注册，请先注册')
      }
      else {
        ElMessage.error('登录失败，请联系管理员')
      }
    }
    else {
      ElMessage.error('登录失败，请检查网络连接')
    }
  }
  catch (error: any) {
    console.error('Login failed:', error)

    if (error.response) {
      if (error.response.status === 401) {
        ElMessage.error('账号或密码错误')
      }
      else if (error.response.status === 404) {
        ElMessage.error('账号未注册，请先注册')
      }
      else {
        ElMessage.error(`登录失败: ${error.response.data.message || '请联系管理员'}`)
      }
    }
    else if (error.request) {
      ElMessage.error('网络错误，请检查网络连接')
    }
    else {
      ElMessage.error('登录失败，请稍后再试')
    }
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  // 清除localStorage中的token（如果需要）
  // localStorage.removeItem('auth_token');
})
</script>

<template>
  <div class="login">
    <div class="loginbox">
      <div class="timessss">{{ loggedDateTime }}</div>
      <div class="bjtupian">
        <img src="@/assets/img/25.png" alt="" width="99%" height="100px" class="bjt">
        <p class="size">北人亦创国际会展中心</p>
      </div>
      <div class="logins">
        <div class="denglu">登录账户</div>
        <form onsubmit="return false;" class="inpt">
          <input v-model="form.username" type="text" placeholder="请输入账号" name="text">
          <input v-model="form.password" type="password" placeholder="请输入密码" name="password">
          <button :disabled="loading" @click="gologin">
            <span v-if="loading">登录中...</span>
            <span v-else>登录</span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login {
  width: 100vw;
  height: 100vh;
  background-image: url('../../assets/img/22.png');
  background-repeat: no-repeat;
  display: flex;
  justify-content: center;
  align-items: center;

  .loginbox {
    .timessss {
      z-index: 9999;
      font-size: 30px;
      color: #fff;
      position: absolute;
      top: 1.1%;
      left: 2%;
    }

    .bjt {
      position: absolute;
      top: 0.8%;
      left: 0.5%;
    }

    .size {
      position: absolute;
      top: 2.1%;
      left: 36.5%;
      font-size: 40px;
      color: #fff;
    }
  }

  .logins {
    position: absolute;
    top: 0;
    left: 0px;
    width: 521px;
    height: 400px;
    background-image: url('@/assets/img/120.png');
    background-size: 100% 100%;
    position: relative;

    .denglu {
      font-size: 30px;
      color: #fff;
      margin-left: 40%;
      padding-top: 40px;
    }

    .inpt {
      display: flex;
      flex-direction: column;
      margin-left: 43px;
      padding-top: 15px;

      input {
        width: 420px;
        height: 38px;
        margin-top: 30px;
        padding: 0 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }

      button {
        width: 430px;
        height: 40px;
        margin-top: 30px;
        border: none;
        background-color: rgb(10, 156, 240);
        color: #fff;
        border-radius: 3px;
        font-size: 16px;
        cursor: pointer;
        transition: background-color 0.3s;

        &:hover {
          background-color: rgb(10, 136, 240);
        }

        &:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }
      }
    }

    .endit {
      font-size: 17px;
      text-align: center;
      color: #fff;
      padding-top: 20px;

      a {
        color: #fff;
        text-decoration: none;

        &:hover {
          text-decoration: underline;
        }
      }
    }
  }
}
</style>
