import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ICreatableType } from '../types';
import { fetchCreatableTypes } from '../api';
import {
  getSpecInfo,
  getTextColorForBackground
} from '../specInfo';

/**
 * Mutable ref object used to communicate the selected type name
 * from the React dialog body back to the imperative showDialog caller.
 */
export interface ICreateDialogSelection {
  selectedType: string | null;
}

/**
 * Props for the CreateProjectDialogBody React component.
 */
interface ICreateProjectDialogBodyProps {
  /** Spec names already detected in the current directory. */
  existingSpecs: string[];
  /** Mutable ref to write the selected type name into. */
  selectionRef: React.MutableRefObject<ICreateDialogSelection>;
}

/**
 * React component rendered as the body of a JupyterLab showDialog().
 *
 * Shows a searchable, filterable list of creatable project types,
 * excluding those already detected in the current directory.
 */
export function CreateProjectDialogBody({
  existingSpecs,
  selectionRef
}: ICreateProjectDialogBodyProps): React.ReactElement {
  const [allTypes, setAllTypes] = useState<ICreatableType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCreatableTypes()
      .then(types => {
        if (!cancelled) {
          setAllTypes(types);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load types');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus();
    }
  }, [loading]);

  const existingSet = useMemo(
    () => new Set(existingSpecs),
    [existingSpecs]
  );

  const availableTypes = useMemo(
    () => allTypes.filter(t => !existingSet.has(t.name)),
    [allTypes, existingSet]
  );

  const filteredTypes = useMemo(() => {
    if (!filter) {
      return availableTypes;
    }
    const lowerFilter = filter.toLowerCase();
    return availableTypes.filter(t => {
      const displayName = getSpecInfo(t.name).displayName.toLowerCase();
      return (
        t.name.toLowerCase().includes(lowerFilter) ||
        displayName.includes(lowerFilter) ||
        t.doc.toLowerCase().includes(lowerFilter)
      );
    });
  }, [availableTypes, filter]);

  const handleSelect = useCallback(
    (name: string) => {
      setSelectedName(name);
      selectionRef.current.selectedType = name;
    },
    [selectionRef]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (filteredTypes.length === 0) {
        return;
      }

      const currentIndex = selectedName
        ? filteredTypes.findIndex(t => t.name === selectedName)
        : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(currentIndex + 1, filteredTypes.length - 1);
        handleSelect(filteredTypes[next].name);
        scrollToItem(next);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(currentIndex - 1, 0);
        handleSelect(filteredTypes[prev].name);
        scrollToItem(prev);
      }
    },
    [filteredTypes, selectedName, handleSelect]
  );

  const scrollToItem = (index: number) => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const items = list.querySelectorAll('.jp-projspec-create-type-item');
    items[index]?.scrollIntoView({ block: 'nearest' });
  };

  useEffect(() => {
    if (
      selectedName &&
      !filteredTypes.some(t => t.name === selectedName)
    ) {
      setSelectedName(null);
      selectionRef.current.selectedType = null;
    }
  }, [filteredTypes, selectedName, selectionRef]);

  if (loading) {
    return (
      <div className="jp-projspec-create-dialog-body">
        <div className="jp-projspec-create-loading">Loading project types...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="jp-projspec-create-dialog-body">
        <div className="jp-projspec-create-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="jp-projspec-create-dialog-body" onKeyDown={handleKeyDown}>
      <input
        ref={inputRef}
        type="text"
        className="jp-projspec-create-search"
        placeholder="Search project types..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />
      <div ref={listRef} className="jp-projspec-create-type-list">
        {filteredTypes.length === 0 ? (
          <div className="jp-projspec-create-empty">
            {availableTypes.length === 0
              ? 'All available project types already exist in this directory.'
              : 'No matching project types found.'}
          </div>
        ) : (
          filteredTypes.map(t => {
            const info = getSpecInfo(t.name);
            const isSelected = t.name === selectedName;
            const textColor = getTextColorForBackground(info.color);
            return (
              <div
                key={t.name}
                className={
                  'jp-projspec-create-type-item' +
                  (isSelected ? ' jp-projspec-create-type-selected' : '')
                }
                onClick={() => handleSelect(t.name)}
              >
                <span
                  className="jp-projspec-create-type-badge"
                  style={{ backgroundColor: info.color, color: textColor }}
                >
                  <span className="jp-projspec-create-type-icon">
                    {info.icon}
                  </span>
                  {info.displayName}
                </span>
                {t.doc && (
                  <span className="jp-projspec-create-type-doc">{t.doc}</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
