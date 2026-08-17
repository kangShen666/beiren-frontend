<script setup lang="ts">
interface Props {
  text: string
  type?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger'
  active?: boolean
}

interface Emits {
  (e: 'click'): void
}

withDefaults(defineProps<Props>(), {
  type: 'primary',
  active: false,
})

const emit = defineEmits<Emits>()

const handleClick = () => {
  emit('click')
}
</script>

<template>
  <button
    class="tech-button" :class="[
      `tech-button--${type}`,
      { 'tech-button--active': active },
    ]" @click="handleClick"
  >
    <span class="tech-button__text">{{ text }}</span>
    <div class="tech-button__bg" />
    <div class="tech-button__border" />
  </button>
</template>

<style scoped lang="scss">
.tech-button {
  position: relative;
  padding: 8px 20px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  outline: none;
  overflow: hidden;
  transition: all 0.3s ease;
  min-width: 80px;
  height: 36px;

  &__text {
    position: relative;
    z-index: 3;
    transition: all 0.3s ease;
  }

  &__bg {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
    transition: all 0.3s ease;
    transform: skewX(-10deg);
    margin: 0 -2px;
  }

  &__border {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    border: 1px solid;
    transition: all 0.3s ease;
    transform: skewX(-10deg);
    margin: 0 -2px;
  }

  // 主要按钮样式
  &--primary {
    .tech-button__bg {
      background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
      opacity: 0.8;
    }

    .tech-button__border {
      border-color: #4facfe;
    }

    &:hover {
      .tech-button__bg {
        opacity: 1;
        background: linear-gradient(135deg, #6fb8ff 0%, #20f4ff 100%);
      }

      .tech-button__border {
        border-color: #6fb8ff;
        box-shadow: 0 0 15px rgba(79, 172, 254, 0.6);
      }

      .tech-button__text {
        text-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
      }
    }

    &.tech-button--active {
      .tech-button__bg {
        opacity: 1;
        background: linear-gradient(135deg, #6fb8ff 0%, #20f4ff 100%);
      }

      .tech-button__border {
        border-color: #6fb8ff;
        box-shadow: 0 0 15px rgba(79, 172, 254, 0.6);
      }
    }
  }

  // 次要按钮样式
  &--secondary {
    .tech-button__bg {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      opacity: 0.8;
    }

    .tech-button__border {
      border-color: #667eea;
    }

    &:hover {
      .tech-button__bg {
        opacity: 1;
        background: linear-gradient(135deg, #7b8ceb 0%, #8b5aa3 100%);
      }

      .tech-button__border {
        border-color: #7b8ceb;
        box-shadow: 0 0 15px rgba(102, 126, 234, 0.6);
      }
    }
  }

  // 成功按钮样式
  &--success {
    .tech-button__bg {
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      opacity: 0.8;
    }

    .tech-button__border {
      border-color: #11998e;
    }

    &:hover {
      .tech-button__bg {
        opacity: 1;
        background: linear-gradient(135deg, #20a999 0%, #4ff088 100%);
      }

      .tech-button__border {
        border-color: #20a999;
        box-shadow: 0 0 15px rgba(17, 153, 142, 0.6);
      }
    }
  }

  // 警告按钮样式
  &--warning {
    .tech-button__bg {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      opacity: 0.8;
    }

    .tech-button__border {
      border-color: #f093fb;
    }

    &:hover {
      .tech-button__bg {
        opacity: 1;
        background: linear-gradient(135deg, #f2a4fc 0%, #f7687d 100%);
      }

      .tech-button__border {
        border-color: #f2a4fc;
        box-shadow: 0 0 15px rgba(240, 147, 251, 0.6);
      }
    }
  }

  // 危险按钮样式
  &--danger {
    .tech-button__bg {
      background: linear-gradient(135deg, #fc466b 0%, #3f5efb 100%);
      opacity: 0.8;
    }

    .tech-button__border {
      border-color: #fc466b;
    }

    &:hover {
      .tech-button__bg {
        opacity: 1;
        background: linear-gradient(135deg, #fd5a7c 0%, #506ffc 100%);
      }

      .tech-button__border {
        border-color: #fd5a7c;
        box-shadow: 0 0 15px rgba(252, 70, 107, 0.6);
      }
    }
  }
}
</style>
