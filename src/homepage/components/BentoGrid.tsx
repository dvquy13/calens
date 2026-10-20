import FeatureCard from './FeatureCard';
import CalendarProgressDemo from './features/CalendarProgressDemo';
import ActivityLensDemo from './features/ActivityLensDemo';

export default function BentoGrid() {
  return (
    <div id="features" className="max-w-7xl mx-auto px-6 py-16 md:py-24 lg:px-16 xl:px-20">
      <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4 text-center">
        Six Features to Transform Your <span className="text-brand">Calendar Experience</span>
      </h2>
      <p className="text-foreground-light mb-12 max-w-2xl text-sm mx-auto text-center">
        Everything you need to understand how you spend your time.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Calendar Progress - 2 cols */}
        <FeatureCard
          title="Calendar Progress"
          description="Visual breakdown of your time across calendars"
          className="md:col-span-2"
        >
          <CalendarProgressDemo />
        </FeatureCard>

        {/* Activity Lens - 2 cols */}
        <FeatureCard
          title="Activity Lens"
          description="13-week heatmap of your scheduling patterns"
          className="md:col-span-2"
        >
          <ActivityLensDemo />
        </FeatureCard>

        {/* Second row - text-only cards */}
        <FeatureCard
          title="Private by Design"
          description="Your calendar data never leaves your browser"
        />

        <FeatureCard
          title="Event Details"
          description="Markdown support for rich event notes"
        />

        <FeatureCard
          title="Top-edge Dragging"
          description="Drag the top of events to adjust start time"
        />

        <FeatureCard
          title="Context-aware Views"
          description="Stats adapt to your current calendar view"
        />
      </div>
    </div>
  );
}
