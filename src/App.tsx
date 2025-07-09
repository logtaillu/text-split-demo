import { useEffect, useRef, useState } from 'react'
import './App.css'
import TextSplit from './text-split';
import { useResizeDetector } from 'react-resize-detector';
const splitHandler = new TextSplit();

function App() {
    const source = useRef<HTMLDivElement>(null);
    const target = useRef<HTMLDivElement>(null);
    const [text, setText] = useState(`第一段文本<div>aaa</div>React 是由 Facebook<div style="width:20px;height:20px;background:blue;display:inline-block;"></div> 开发的 JavaScript 库，用于构建用户界面。它采用组件化架构，将复杂 UI 拆分为可复用的独立组件，提升代码维护性。核心特点包括声明式语法、虚拟 DOM 和单向数据流。

声明式语法通过 JSX 实现，<img src="/vite.svg" />允许在 JavaScript 中编写类似 HTML 的结构，使代码更直观。虚拟 DOM 机制会先对比新旧状态差异，再更新真实 DOM，减少浏览器重绘成本，提升性能。

组件是 React 应用的基础单元，分为函数组件和类组件。

单向数据流指数据从父组件通过 props 传递给子组件，子组件不能直接修改父组件状态，需通过回调函数实现交互。状态管理可借助 React 内置的 useState、useEffect 等 Hook，或 Redux、Context 等外部库。

React 生态丰富，配套工具有 Create React App 快速搭建项目，React Router 实现前端路由，React Testing Library 进行组件测试。其优势在于学习曲线平缓、社区活跃、生态完善，广泛应用于单页应用、移动应用（通过 React Native）等场景。

使用 React 开发时，需注意组件生命周期（类组件）或 Hook 调用规则，避免副作用导致的内存泄漏。虚拟 DOM  diff 算法采用深度优先遍历，通过 key 属性优化列表渲染效率。当前 React 最新版本持续优化并发渲染机制，提升应用响应性能。`);
    const [html, setHtml] = useState('');

    // // 高度变化监听
    const { width, ref } = useResizeDetector<HTMLDivElement>({
        refreshMode: 'debounce',
        handleHeight: false,
        refreshRate: 100,
        refreshOptions: { leading: true, trailing: true }
    });
    const startSplit = (content: string) => {
        if (source.current && target.current) {
            splitHandler.splitText(source.current, target.current, content);
        }
    };
    // 监听外容器宽度变化，重新分割
    useEffect(() => {
        if (width) {
            startSplit(html);
        }
    }, [width]);
    // 点击转换，初始分割
    const onClick = () => {
        setHtml(text);
        startSplit(text);
    }
    return (
        <div className='flex flex-col items-center justify-center gap-4 max-w-100 w-full m-auto relative' ref={ref}>
            <textarea
                onChange={(e) => { setText(e.target.value) }}
                className='w-full h-30 border border-solid rounded' placeholder='请输入文本'
                value={text}
            ></textarea>
            <div ref={source} className='w-full border border-solid rounded h-50 overflow-hidden p-3 leading-6 box-border'></div>
            <div ref={target} className='w-full border border-solid rounded min-h-50 p-3 leading-6 box-border'></div>
            <button onClick={onClick}>转换</button>
        </div>
    )
}

export default App
