import { useState } from "react";
import { dimensionsFor, isTimeSeries, lastYear, seriesFor, topicById, topics, unitLabel } from "../lib/data";
import { snapshotNarrative } from "../lib/narrative";
import { BarList } from "../components/charts";
import { Card, Segmented, type Go } from "../components/ui";

function SnapshotCard({ topicId, onOpen }: { topicId: string; onOpen: (dim: string) => void }) {
  const topic = topicById[topicId];
  const dims = dimensionsFor(topicId).filter((d) => d !== "Overall");
  const [dim, setDim] = useState(dims[0]);
  const segs = seriesFor(topicId, dim);
  const insight = snapshotNarrative(topic, dim)[0];
  return (
    <Card
      title={topic.label}
      subtitle={`${unitLabel[topic.unit]} · FY${lastYear}`}
      actions={<button className="btn" onClick={() => onOpen(dim)}>Open</button>}
    >
      {dims.length > 1 && (
        <div className="mb-3">
          <Segmented label="Breakdown" value={dim} onChange={setDim} options={dims.map((d) => ({ value: d, label: d }))} />
        </div>
      )}
      <BarList rows={segs.map((s) => ({ name: s.segment, value: s.points[0].value }))} unit={topic.unit} label={topic.label} />
      {insight && <p className="mt-2 text-[13px] text-ink-2">{insight.text}</p>}
    </Card>
  );
}

export function Snapshot({ go }: { go: Go }) {
  const list = topics.filter((t) => !isTimeSeries(t.id));
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h2 className="text-[15px] font-semibold text-ink">FY{lastYear} snapshot</h2>
        <p className="text-[13px] text-muted">
          Questions asked only in the latest survey: why households still use mail, how they respond to advertising, and how satisfied they are with USPS package service.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((t) => (
          <SnapshotCard key={t.id} topicId={t.id} onOpen={(d) => go(t.id, d)} />
        ))}
      </div>
    </div>
  );
}
