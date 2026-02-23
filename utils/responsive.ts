import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Guideline sizes are based on standard ~5" screen mobile device
const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;

/**
 * Scale based on width (good for horizontal padding, margins, width)
 */
const scale = (size: number) => {
    return (SCREEN_WIDTH / guidelineBaseWidth) * size;
};

/**
 * Scale based on height (good for vertical padding, margins, height)
 */
const verticalScale = (size: number) => {
    return (SCREEN_HEIGHT / guidelineBaseHeight) * size;
};

/**
 * Scale with a factor. 
 */
const moderateScale = (size: number, factor = 0.5) => {
    return size + (scale(size) - size) * factor;
};

export { moderateScale, scale, SCREEN_HEIGHT, SCREEN_WIDTH, verticalScale };

