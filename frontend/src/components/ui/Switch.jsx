/** Visual on/off switch - put it inside a button with role="switch". */
export default function Switch({ on }) {
    return (
        <span aria-hidden="true" className={`w-12 h-7 rounded-full p-[3px] flex transition-colors shrink-0 ${on ? 'bg-chart justify-end' : 'bg-line-strong justify-start'}`}>
            <span className="block w-[22px] h-[22px] rounded-full bg-white shadow" />
        </span>
    );
}
