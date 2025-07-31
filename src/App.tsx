// 扩展 Window 接口，添加 MathJax 属性
declare global {
  interface Window {
    MathJax: {
      Hub: {
        Queue: (
          args: unknown[],
          callback?: () => void
        ) => void;
      };
    };
  }
}

import { useRef, useState } from 'react'
import './App.css'
// @ts-expect-error 忽略js文件
import TextSplit from './text-split.js'
import { useResizeDetector } from 'react-resize-detector'
import demoText from './text'
const splitHandler = new TextSplit()
/**
 *
 *  if (window.MathJax) {
        MathJax.Hub.Queue(['Typeset', MathJax.Hub])
      }
 */
function App() {
  const source = useRef<HTMLDivElement>(null)
  const target = useRef<HTMLDivElement>(null)
  const third = useRef<HTMLDivElement>(null)
  const htmlRef = useRef<HTMLDivElement>(null)
  const [text, setText] = useState(new Array(1).fill(demoText).join('\n'))

  // // 高度变化监听
  const { ref } = useResizeDetector<HTMLDivElement>({
    refreshMode: 'debounce',
    handleHeight: false,
    refreshRate: 100,
    refreshOptions: { leading: true, trailing: true }
  })

  // 触发公式渲染
  const renderMathJax = async () => {
    return new Promise((resolve) => {
    //   if (window.MathJax) {
    //     // 调用 MathJax 进行公式排版
    //     window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub],
    //       // function () {
    //       //   resolve(true)
    //       // }
    //     )
    //   }
      resolve(true)
    })
  }
  const clearContent = () => {
    source.current!.innerHTML = ''
    htmlRef.current!.innerHTML = ''
    target.current!.innerHTML = ''
    third.current!.innerHTML = ''
  }
  // 开始切割
  const startSplit = () => {
    // 先做个清除
    clearContent()
    splitHandler.splitText(text, [source.current, target.current, third.current], renderMathJax)
  }
  // 监听外容器宽度变化，重新分割
  // useEffect(() => {
  //   if (width) {
  //     startSplit(html);
  //   }
  // }, [width]);
  const calcHeight = async () => {
    clearContent()
    htmlRef.current!.innerHTML = text
    // 容器内部高度：不含边框和padding
    const containerHeight = splitHandler.getContainerHeight(source.current, false)
    await splitHandler.waitRender(htmlRef.current, renderMathJax)
    const usedHeight = splitHandler.getContentHeight(htmlRef.current, containerHeight)
    console.log('usedHeight', usedHeight, 'containerHeight', containerHeight)
  }
  const cls = 'w-full border border-none rounded overflow-hidden p-0 leading-[1.5] box-border text-12px'
  return (
    <div className='flex flex-col items-center justify-center gap-4 max-w-200 w-462px m-auto relative text-left' ref={ref}>
      <textarea
        onChange={(e) => { setText(e.target.value) }}
        className='w-full h-30 border border-solid rounded' placeholder='请输入文本'
        value={text}
      ></textarea>
      <div className={cls} ref={htmlRef} />
      <div ref={source} className={`${cls} h-72px`}></div>
      <div ref={target} className={`${cls} h-130`}></div>
      <div ref={third}  className={`${cls} min-h-50`}></div>
      <div>
        <button onClick={startSplit}>转换</button>
        <button onClick={calcHeight}>测量</button>
      </div>
    </div>
  )
}

export default App
