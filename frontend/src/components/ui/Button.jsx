import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    soft: 'btn-soft',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
    success: 'btn-success',
    dark: 'btn-dark',
};

const SIZES = {
    sm: 'btn-sm',
    md: '',
    lg: 'btn-lg',
};

/**
 * Button / link button with consistent styling.
 * Pass `to` to render a router Link, `href` for a plain anchor.
 */
export default function Button({
    variant = 'secondary',
    size = 'md',
    icon: Icon,
    iconRight: IconRight,
    loading = false,
    block = false,
    className = '',
    children,
    to,
    href,
    type = 'button',
    ...rest
}) {
    const classes = ['btn', VARIANTS[variant] || '', SIZES[size] || '', block ? 'btn-block' : '', className]
        .filter(Boolean)
        .join(' ');

    const iconSize = size === 'sm' ? 14 : size === 'lg' ? 20 : 17;
    const content = (
        <>
            {loading ? <Loader2 size={iconSize} className="animate-spin" /> : Icon ? <Icon size={iconSize} /> : null}
            {children}
            {IconRight && !loading ? <IconRight size={iconSize} /> : null}
        </>
    );

    if (to) {
        return (
            <Link to={to} className={classes} {...rest}>
                {content}
            </Link>
        );
    }
    if (href) {
        return (
            <a href={href} className={classes} {...rest}>
                {content}
            </a>
        );
    }
    return (
        <button type={type} className={classes} disabled={loading || rest.disabled} {...rest}>
            {content}
        </button>
    );
}

export function IconButton({ icon: Icon, label, variant = 'ghost', size = 20, className = '', ...rest }) {
    if (!Icon) return null;
    return (
        <button
            type="button"
            className={`btn btn-icon ${VARIANTS[variant] || ''} ${className}`}
            title={label}
            aria-label={label}
            {...rest}
        >
            <Icon size={size} />
        </button>
    );
}
