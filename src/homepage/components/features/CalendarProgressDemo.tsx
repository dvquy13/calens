import { TimeChart } from '@/components/sidepanel/TimeChart';
import {
  mockTimeChartData,
  mockTotalHours,
  mockTotalCompleted,
  mockTotalPlanned,
} from '../../mock-data';

export default function CalendarProgressDemo() {
  return (
    <div className="w-full">
      <TimeChart
        chartData={mockTimeChartData}
        totalHours={mockTotalHours}
        totalCompleted={mockTotalCompleted}
        totalPlanned={mockTotalPlanned}
        aggregationMode="calendar"
        onAggregationModeChange={() => {}}
      />
    </div>
  );
}
