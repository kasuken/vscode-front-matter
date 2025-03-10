import { PencilIcon, SelectorIcon, TrashIcon, XIcon } from '@heroicons/react/outline';
import * as React from 'react';
import { SortableHandle, SortableElement } from 'react-sortable-hoc';
import useThemeColors from '../../hooks/useThemeColors';
import { LinkButton } from '../Common/LinkButton';
import { Alert } from '../Modals/Alert';

export interface ISortableItemProps {
  value: string;
  index: number;
  crntIndex: number;
  selectedIndex: number | null;
  onSelectedIndexChange: (index: number) => void;
  onDeleteItem: (index: number) => void;
}

const DragHandle = SortableHandle(() => <SelectorIcon className={`w-6 h-6 cursor-move hover:text-[var(--frontmatter-link-hover)]`} />);

export const SortableItem = SortableElement(
  ({
    value,
    selectedIndex,
    crntIndex,
    onSelectedIndexChange,
    onDeleteItem
  }: ISortableItemProps) => {
    const [showAlert, setShowAlert] = React.useState(false);
    const { getColors } = useThemeColors();

    const deleteItemConfirm = () => {
      setShowAlert(true);
    };

    return (
      <>
        <li
          data-test={`${selectedIndex}-${crntIndex}`}
          className={`sortable_item py-2 px-2 w-full flex justify-between content-center cursor-pointer ${selectedIndex === crntIndex ? getColors(`bg-gray-300 dark:bg-vulcan-300`, `bg-[var(--frontmatter-list-selected-background)] text-[var(--frontmatter-list-selected-text)]`) : ``
            } ${getColors(
              'hover:bg-gray-200 dark:hover:bg-vulcan-400',
              'hover:bg-[var(--frontmatter-list-hover-background)]'
            )
            }`}
        >
          <div
            className="flex items-center w-full"
            onClick={() => onSelectedIndexChange(crntIndex)}
          >
            <DragHandle />
            <span>{value}</span>
          </div>

          <div className={`space-x-2 flex items-center`}>
            <LinkButton
              title={`Edit "${value}"`}
              onClick={() => onSelectedIndexChange(crntIndex)}>
              <PencilIcon className="w-4 h-4" />
              <span className="sr-only">Edit</span>
            </LinkButton>

            <LinkButton
              title={`Delete "${value}"`}
              onClick={() => deleteItemConfirm()}>
              <TrashIcon className="w-4 h-4" />
              <span className="sr-only">Delete</span>
            </LinkButton>
          </div>
        </li>

        {showAlert && (
          <Alert
            title={`Delete data entry`}
            description={`Are you sure you want to delete the data entry?`}
            okBtnText={`Delete`}
            cancelBtnText={`Cancel`}
            dismiss={() => setShowAlert(false)}
            trigger={() => {
              setShowAlert(false);
              onDeleteItem(crntIndex);
            }}
          />
        )}
      </>
    );
  }
);
