import { useState, useMemo, useRef, useCallback, useEffect, Fragment } from 'react';
import { X, Pin } from 'lucide-react';
import {
  Command,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
  CommandSeparator
} from '../ui/command';
import { Badge } from '../ui/badge';
import { TimeEntry } from '../../types/calendar';
import { filterEvents, getUniqueCalendars, getUniqueTags, getUniqueEventNames } from '../../lib/event-filter-utils';
import { cn } from '@/lib/utils';

export interface PinnedCalendar {
  id: string;
  name: string;
  color: string;
}

interface PinnedFilters {
  calendars: PinnedCalendar[];
  tags: string[];
  eventNames: string[];
}

const PINNED_FILTERS_KEY = 'pinned_filters';

interface UnifiedFilterProps {
  // All events (needed for progressive filtering)
  events: TimeEntry[];
  eventTagsMap: Map<string, string[]>;

  // Selected filters
  selectedCalendarIds: string[];
  onCalendarChange: (ids: string[]) => void;
  selectedTags: string[];
  onTagChange: (tags: string[]) => void;
  selectedEventName: string | null;
  onEventNameChange: (name: string | null) => void;

  // UI props
  placeholder?: string;
  disabled?: boolean;

  // Unified color for tag/event badges when all filtered events share the same color
  unifiedColor?: string;

  // Demo/landing page props - allows using without Chrome APIs
  initialPinnedCalendars?: PinnedCalendar[];
  initialPinnedTags?: string[];
  initialPinnedEventNames?: string[];
  persistPins?: boolean; // default true, set false for landing page
}

export function UnifiedFilter({
  events,
  eventTagsMap,
  selectedCalendarIds,
  onCalendarChange,
  selectedTags,
  onTagChange,
  selectedEventName,
  onEventNameChange,
  placeholder = "Filter by calendar, tag, or event name...",
  disabled = false,
  unifiedColor,
  initialPinnedCalendars,
  initialPinnedTags,
  initialPinnedEventNames,
  persistPins = true,
}: UnifiedFilterProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [pinnedCalendars, setPinnedCalendars] = useState<PinnedCalendar[]>([]);
  const [pinnedTags, setPinnedTags] = useState<string[]>([]);
  const [pinnedEventNames, setPinnedEventNames] = useState<string[]>([]);
  const [filterGroupOrder, setFilterGroupOrder] = useState<Array<'calendar' | 'tag' | 'eventName'>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);

  // Debounce search query (150ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  // Load pinned filters on mount
  useEffect(() => {
    // If persistPins is false, use initial values from props (for landing page demo)
    if (!persistPins) {
      setPinnedCalendars(initialPinnedCalendars || []);
      setPinnedTags(initialPinnedTags || []);
      setPinnedEventNames(initialPinnedEventNames || []);
      hasLoadedRef.current = true;
      return;
    }

    // Load from chrome.storage when persistPins is true
    const loadPinnedFilters = async () => {
      const result = await chrome.storage.local.get([PINNED_FILTERS_KEY]);
      const data = result[PINNED_FILTERS_KEY] as PinnedFilters | undefined;
      if (data) {
        setPinnedCalendars(data.calendars || []);
        setPinnedTags(data.tags || []);
        setPinnedEventNames(data.eventNames || []);
      }
      hasLoadedRef.current = true;
    };
    loadPinnedFilters();
  }, [persistPins, initialPinnedCalendars, initialPinnedTags, initialPinnedEventNames]);

  // Save pinned filters when they change (skip if persistPins is false)
  useEffect(() => {
    if (!hasLoadedRef.current || !persistPins) return;

    const savePinnedFilters = async () => {
      const data: PinnedFilters = {
        calendars: pinnedCalendars,
        tags: pinnedTags,
        eventNames: pinnedEventNames,
      };
      await chrome.storage.local.set({ [PINNED_FILTERS_KEY]: data });
    };
    savePinnedFilters();
  }, [pinnedCalendars, pinnedTags, pinnedEventNames, persistPins]);

  // Validate pinned calendars against available data
  useEffect(() => {
    const validCalendarIds = new Set(getUniqueCalendars(events).map(c => c.id));
    setPinnedCalendars(prev => prev.filter(c => validCalendarIds.has(c.id)));
  }, [events]);

  // Progressive filtering: compute available options from current filtered event pool
  const currentFilteredEvents = useMemo(() => {
    return filterEvents(events, selectedCalendarIds, selectedTags, eventTagsMap, selectedEventName);
  }, [events, selectedCalendarIds, selectedTags, eventTagsMap, selectedEventName]);

  // Available calendars from current filtered event pool
  const availableCalendars = useMemo(() => {
    return getUniqueCalendars(currentFilteredEvents);
  }, [currentFilteredEvents]);

  // Available tags from current filtered event pool
  const availableTags = useMemo(() => {
    const filteredEventIds = new Set(currentFilteredEvents.map(e => e.eventId));
    const filteredTagsMap = new Map();

    eventTagsMap.forEach((tags, eventId) => {
      if (filteredEventIds.has(eventId)) {
        filteredTagsMap.set(eventId, tags);
      }
    });

    return getUniqueTags(filteredTagsMap);
  }, [currentFilteredEvents, eventTagsMap]);

  // Available event names from progressive pool
  const availableEventNames = useMemo(() => {
    return getUniqueEventNames(currentFilteredEvents);
  }, [currentFilteredEvents]);

  // Filter suggestions by debounced search query and hide already selected
  const filteredCalendars = useMemo(() =>
    availableCalendars.filter(cal =>
      cal.name.toLowerCase().includes(debouncedQuery.toLowerCase()) &&
      !selectedCalendarIds.includes(cal.id)
    ), [availableCalendars, debouncedQuery, selectedCalendarIds]
  );

  const filteredTags = useMemo(() =>
    availableTags.filter(tag =>
      tag.toLowerCase().includes(debouncedQuery.toLowerCase()) &&
      !selectedTags.includes(tag)
    ), [availableTags, debouncedQuery, selectedTags]
  );

  const filteredEventNames = useMemo(() =>
    availableEventNames.filter(name =>
      name.toLowerCase().includes(debouncedQuery.toLowerCase()) &&
      name !== selectedEventName
    ), [availableEventNames, debouncedQuery, selectedEventName]
  );

  // Selected calendars for chip display (from all events, not filtered)
  const selectedCalendars = useMemo(() => {
    const allCalendars = getUniqueCalendars(events);
    return allCalendars.filter(cal => selectedCalendarIds.includes(cal.id));
  }, [events, selectedCalendarIds]);

  // Handlers
  const handleSelectCalendar = useCallback((calendar: { id: string; name: string; color: string }) => {
    onCalendarChange([...selectedCalendarIds, calendar.id]);

    // Track filter order for dynamic dropdown ordering
    if (!filterGroupOrder.includes('calendar')) {
      setFilterGroupOrder(prev => [...prev, 'calendar']);
    }

    setSearchQuery('');
    setOpen(false);
    inputRef.current?.blur(); // Exit the filter bar
  }, [selectedCalendarIds, onCalendarChange, filterGroupOrder]);

  const handleSelectTag = useCallback((tag: string) => {
    onTagChange([...selectedTags, tag]);

    // Track filter order for dynamic dropdown ordering
    if (!filterGroupOrder.includes('tag')) {
      setFilterGroupOrder(prev => [...prev, 'tag']);
    }

    setSearchQuery('');
    setOpen(false);
    inputRef.current?.blur(); // Exit the filter bar
  }, [selectedTags, onTagChange, filterGroupOrder]);

  const handleSelectEventName = useCallback((name: string) => {
    // Auto-replace - just set the new name directly
    onEventNameChange(name);

    // Track filter order for dynamic dropdown ordering
    if (!filterGroupOrder.includes('eventName')) {
      setFilterGroupOrder(prev => [...prev, 'eventName']);
    }

    setSearchQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }, [onEventNameChange, filterGroupOrder]);

  const removeCalendar = useCallback((calendarId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onCalendarChange(selectedCalendarIds.filter(id => id !== calendarId));
  }, [selectedCalendarIds, onCalendarChange]);

  const removeTag = useCallback((tag: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onTagChange(selectedTags.filter(t => t !== tag));
  }, [selectedTags, onTagChange]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const togglePinCalendar = useCallback((calendar: PinnedCalendar, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setPinnedCalendars(prev => {
      const isPinned = prev.some(c => c.id === calendar.id);
      return isPinned
        ? prev.filter(c => c.id !== calendar.id)
        : [...prev, calendar];
    });
    // Keep dropdown open - don't call setOpen(false)
  }, []);

  const togglePinTag = useCallback((tag: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setPinnedTags(prev => {
      const isPinned = prev.includes(tag);
      return isPinned
        ? prev.filter(t => t !== tag)
        : [...prev, tag];
    });
  }, []);

  const togglePinEventName = useCallback((name: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setPinnedEventNames(prev => {
      const isPinned = prev.includes(name);
      return isPinned
        ? prev.filter(n => n !== name)
        : [...prev, name];
    });
  }, []);

  const noSelections = selectedCalendars.length === 0 && selectedTags.length === 0 && !selectedEventName;

  // Build groups in order of first use, then remaining
  const orderedGroups = useMemo(() => {
    const allGroups = ['calendar', 'tag', 'eventName'] as const;
    const ordered = [...filterGroupOrder];
    allGroups.forEach(g => {
      if (!ordered.includes(g)) ordered.push(g);
    });
    return ordered;
  }, [filterGroupOrder]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex min-h-10 w-full flex-wrap gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        onClick={() => !disabled && inputRef.current?.focus()}
      >
          {/* Calendar chips with color styling */}
          {selectedCalendars.map(cal => (
            <Badge
              key={cal.id}
              variant="default"
              style={{
                backgroundColor: cal.color,
                color: 'white',
                borderColor: cal.color,
              }}
              className="cursor-pointer"
            >
              {cal.name}
              <X
                className="ml-1 h-3 w-3 cursor-pointer hover:opacity-70"
                onClick={(e) => removeCalendar(cal.id, e)}
              />
            </Badge>
          ))}

          {/* Tag chips - use unified color when available */}
          {selectedTags.map(tag => (
            <Badge
              key={tag}
              variant={unifiedColor ? "default" : "outline"}
              style={unifiedColor ? {
                backgroundColor: unifiedColor,
                color: 'white',
                borderColor: unifiedColor,
              } : undefined}
              className={cn("cursor-pointer", !unifiedColor && "bg-muted")}
            >
              {tag}
              <X
                className="ml-1 h-3 w-3 cursor-pointer hover:opacity-70"
                onClick={(e) => removeTag(tag, e)}
              />
            </Badge>
          ))}

          {/* Event name chip - use unified color when available */}
          {selectedEventName && (
            <Badge
              variant={unifiedColor ? "default" : "outline"}
              style={unifiedColor ? {
                backgroundColor: unifiedColor,
                color: 'white',
                borderColor: unifiedColor,
              } : undefined}
              className={cn("cursor-pointer", !unifiedColor && "bg-transparent")}
            >
              {selectedEventName}
              <X
                className="ml-1 h-3 w-3 cursor-pointer hover:opacity-70"
                onClick={(e) => {
                  e.stopPropagation();
                  onEventNameChange(null);
                }}
              />
            </Badge>
          )}

          {/* Search input */}
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={handleSearch}
            onFocus={() => !disabled && setOpen(true)}
            placeholder={noSelections ? placeholder : ""}
            disabled={disabled}
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground min-w-[120px]"
          />
      </div>

      {/* Pinned pills row */}
      {(pinnedCalendars.length > 0 || pinnedTags.length > 0 || pinnedEventNames.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {/* Pinned calendar pills (hide if selected or not in progressive event pool) */}
          {pinnedCalendars
            .filter(cal => {
              // Hide if already selected
              if (selectedCalendarIds.includes(cal.id)) return false;
              // Only show if it exists in the progressive event pool
              return availableCalendars.some(available => available.id === cal.id);
            })
            .map(cal => (
              <Badge
                key={`pinned-cal-${cal.id}`}
                variant="outline"
                style={{
                  borderColor: cal.color,
                  color: cal.color,
                }}
                onClick={() => handleSelectCalendar(cal)}
                className="group cursor-pointer hover:bg-accent/10 overflow-hidden"
              >
                {cal.name}
                <X
                  className="ml-0 h-3 w-0 cursor-pointer transition-all duration-200 group-hover:ml-1 group-hover:w-3"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePinCalendar(cal, e);
                  }}
                />
              </Badge>
            ))}

          {/* Pinned tag pills (hide if selected or not in progressive event pool) */}
          {pinnedTags
            .filter(tag => {
              // Hide if already selected
              if (selectedTags.includes(tag)) return false;
              // Only show if it exists in the progressive event pool
              return availableTags.includes(tag);
            })
            .map(tag => (
              <Badge
                key={`pinned-tag-${tag}`}
                variant="outline"
                onClick={() => handleSelectTag(tag)}
                className="group cursor-pointer hover:bg-accent/10 overflow-hidden"
              >
                {tag}
                <X
                  className="ml-0 h-3 w-0 cursor-pointer transition-all duration-200 group-hover:ml-1 group-hover:w-3"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePinTag(tag, e);
                  }}
                />
              </Badge>
            ))}

          {/* Pinned event name pills (hide if selected or not in progressive event pool) */}
          {pinnedEventNames
            .filter(name => {
              // Hide if already selected
              if (name === selectedEventName) return false;
              // Only show if it exists in the progressive event pool
              return availableEventNames.includes(name);
            })
            .map(name => (
              <Badge
                key={`pinned-event-${name}`}
                variant="outline"
                onClick={() => handleSelectEventName(name)}
                className="group cursor-pointer hover:bg-accent/10 overflow-hidden"
              >
                {name}
                <X
                  className="ml-0 h-3 w-0 cursor-pointer transition-all duration-200 group-hover:ml-1 group-hover:w-3"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePinEventName(name, e);
                  }}
                />
              </Badge>
            ))}
        </div>
      )}

      {open && (
        <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-md outline-none">
        <Command shouldFilter={false}>
          <CommandList>
            {/* Show "No results" when all groups are empty */}
            {filteredCalendars.length === 0 && filteredTags.length === 0 && filteredEventNames.length === 0 && (
              <CommandEmpty>No results found</CommandEmpty>
            )}

            {/* Render groups dynamically in order of first use */}
            {orderedGroups.map((groupType, idx) => {
              const showSeparator = idx > 0;

              if (groupType === 'eventName' && filteredEventNames.length > 0) {
                return (
                  <Fragment key="eventName">
                    {showSeparator && <CommandSeparator />}
                    <CommandGroup heading="Event Names">
                      {filteredEventNames.map(name => (
                        <CommandItem
                          key={name}
                          onSelect={() => handleSelectEventName(name)}
                          className="flex items-center justify-between"
                        >
                          <span>{name}</span>
                          <button
                            onPointerDown={(e) => togglePinEventName(name, e)}
                            className="ml-2 p-1 hover:bg-accent rounded"
                            aria-label={pinnedEventNames.includes(name) ? "Unpin" : "Pin"}
                          >
                            <Pin
                              className={cn(
                                "h-4 w-4",
                                pinnedEventNames.includes(name) && "fill-current"
                              )}
                            />
                          </button>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Fragment>
                );
              }

              if (groupType === 'calendar' && filteredCalendars.length > 0) {
                return (
                  <Fragment key="calendar">
                    {showSeparator && <CommandSeparator />}
                    <CommandGroup heading="Calendars">
                      {filteredCalendars.map(cal => (
                        <CommandItem
                          key={cal.id}
                          onSelect={() => handleSelectCalendar(cal)}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center">
                            <div
                              className="mr-2 h-3 w-3 rounded-sm"
                              style={{ backgroundColor: cal.color }}
                            />
                            {cal.name}
                          </div>
                          <button
                            onPointerDown={(e) => togglePinCalendar(cal, e)}
                            className="ml-2 p-1 hover:bg-accent rounded"
                            aria-label={pinnedCalendars.some(c => c.id === cal.id) ? "Unpin" : "Pin"}
                          >
                            <Pin
                              className={cn(
                                "h-4 w-4",
                                pinnedCalendars.some(c => c.id === cal.id) && "fill-current"
                              )}
                            />
                          </button>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Fragment>
                );
              }

              if (groupType === 'tag' && filteredTags.length > 0) {
                return (
                  <Fragment key="tag">
                    {showSeparator && <CommandSeparator />}
                    <CommandGroup heading="Tags">
                      {filteredTags.map(tag => (
                        <CommandItem
                          key={tag}
                          onSelect={() => handleSelectTag(tag)}
                          className="flex items-center justify-between"
                        >
                          <span>{tag}</span>
                          <button
                            onPointerDown={(e) => togglePinTag(tag, e)}
                            className="ml-2 p-1 hover:bg-accent rounded"
                            aria-label={pinnedTags.includes(tag) ? "Unpin" : "Pin"}
                          >
                            <Pin
                              className={cn(
                                "h-4 w-4",
                                pinnedTags.includes(tag) && "fill-current"
                              )}
                            />
                          </button>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Fragment>
                );
              }

              return null;
            })}
          </CommandList>
        </Command>
        </div>
      )}
    </div>
  );
}
