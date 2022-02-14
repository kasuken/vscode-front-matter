import * as React from 'react';
import { PencilIcon, SelectorIcon, TrashIcon } from '@heroicons/react/outline';
import {  SortableHandle, SortableElement } from 'react-sortable-hoc';
export interface IJsonFieldRecordProps {
  id: number;
  index: number;
  label: string;
  isSelected?: boolean;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}

const DragHandle = SortableHandle(() => <span className='drag_handler'><SelectorIcon /></span>);

export const JsonFieldRecord = SortableElement(({ label, id, onEdit, onDelete, isSelected }: React.PropsWithChildren<IJsonFieldRecordProps>) => {
  return (
    <li className={`data_block__record ${isSelected ? `data_block__record_selected` : ``}`}>
      <div>
        <DragHandle />

        <span>{label} - {id+1}</span>
      </div>

      <div>
        <button title='Edit record' className='data_block__list__button data_block__list__button_edit' onClick={() => onEdit(id)}>
          <PencilIcon className='data_block__list__button_icon' />
          <span className='sr-only'>Edit</span>
        </button>
        <button title='Delete record' className='data_block__list__button data_block__list__button_delete' onClick={() => onDelete(id)}>
          <TrashIcon className='data_block__list__button_icon' />
          <span className='sr-only'>Delete</span>
        </button>
      </div>
    </li>
  );
});