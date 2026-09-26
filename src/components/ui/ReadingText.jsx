/** 解读正文：【小标题】单独成行渲染成标题，其余按段落。 */
export default function ReadingText({ text, streaming }) {
  const blocks = text.split(/\n+/).filter((line) => line.trim());
  return (
    <div className="reading-text">
      {blocks.map((line, i) => {
        const heading = line.trim().match(/^【(.+?)】\s*(.*)$/);
        const last = i === blocks.length - 1;
        if (heading) {
          return (
            <div key={i}>
              <h3>{heading[1]}</h3>
              {heading[2] && <p>{heading[2]}{streaming && last && <Caret />}</p>}
              {!heading[2] && streaming && last && <Caret />}
            </div>
          );
        }
        return <p key={i}>{line}{streaming && last && <Caret />}</p>;
      })}
      {!blocks.length && streaming && <Caret />}
    </div>
  );
}
const Caret = () => <span className="reading-caret" aria-hidden="true" />;
