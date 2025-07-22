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
  const [html, setHtml] = useState('')

  // // 高度变化监听
  const { width, ref } = useResizeDetector<HTMLDivElement>({
    refreshMode: 'debounce',
    handleHeight: false,
    refreshRate: 100,
    refreshOptions: { leading: true, trailing: true }
  });
  const startSplit = (content: string) => {
    if (source.current && target.current && third.current) {
      target.current.innerHTML = ''
      third.current.innerHTML = ''
      splitHandler.splitText(content, [source.current, target.current, third.current])
    }
  }
  // 监听外容器宽度变化，重新分割
  // useEffect(() => {
  //   if (width) {
  //     startSplit(html);
  //   }
  // }, [width]);
  // 点击转换，初始分割
  const updateHtml = () => {
    setTimeout(() => {
      if (window.MathJax) {
        MathJax.Hub.Queue(['Typeset', MathJax.Hub],
          function () {
            console.log('end')
          }
        )
      }
    }, 20)
  }
  const onClick = async () => {
    setHtml('')
    updateHtml()
    startSplit(text)
  }
  const calcHeight = async () => {
    setHtml(text)
    updateHtml()
    await splitHandler.waitForComplete(htmlRef.current)
    const containerHeight = splitHandler.getContainerHeight(source.current, false)
    const usedHeight = splitHandler.getContentHeight(htmlRef.current, containerHeight)
    console.log('usedHeight', usedHeight, 'containerHeight', containerHeight)
  }
  return (
    <div className='flex flex-col items-center justify-center gap-4 max-w-200 w-full m-auto relative text-left' ref={ref}>
      <textarea
        onChange={(e) => { setText(e.target.value) }}
        className='w-full h-30 border border-solid rounded' placeholder='请输入文本'
        value={text}
      ></textarea>
      <div className='w-full border border-solid rounded overflow-hidden p-3 leading-6 box-border' dangerouslySetInnerHTML={{ __html: html }} ref={htmlRef} />
      <div ref={source} className='w-full border border-solid rounded h-75 overflow-hidden p-3 leading-6 box-border'></div>
      <div ref={target} className='w-full border border-solid rounded min-h-50 p-3 leading-6 overflow-hidden box-border h-70'></div>
      <div ref={third} className='w-full border border-solid rounded min-h-50 p-3 leading-6 box-border'></div>
      <button onClick={onClick}>转换</button>
      <button onClick={calcHeight}>测量</button>
    </div>
  )
}

export default App
